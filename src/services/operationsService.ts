import type { Execution, ListQuery, ListResult, TreasuryTxn, Voucher } from '@/domain/types';
import { INTERNAL_BANK_CODE } from '@/domain/rules';
import { nowIso } from '@/lib/dates';
import { formatNaira } from '@/lib/format';
import { add, isPositive, isZero, ZERO } from '@/lib/money';
import type { Db } from '@/data/db';
import { getDb } from '@/data/store';
import { findById, getById, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run } from './core';
import { filterTxns, type TxnRow } from './transactionsService';
import * as wf from './workflow';
import { paysOut } from './voucherBuilder';

export interface OpsRow extends TxnRow {
  gapsRequired: boolean;
  attempts: number;
  lastFailure: string | null;
  payoutAmt: string;
  /** The payment recorded by the first officer, awaiting a second. */
  prepared: {
    outcome: 'SUCCESS' | 'FAILED';
    cbsPostingRef: string;
    gapsRef: string | null;
    failureReason: string | null;
    preparedBy: string;
    preparedAt: string;
  } | null;
  /** Why the signed-in officer cannot approve the payment record, or null. */
  approveBlocker: string | null;
}

export interface OpsQueue extends ListResult<OpsRow> {
  totalToPay: string;
}

export interface ExecuteResult {
  txn: TreasuryTxn;
  execution: Execution;
  ok: boolean;
}

export interface OperationsService {
  queue(
    q?: ListQuery<{
      search?: string;
      status?: 'PENDING_OPERATIONS' | 'PENDING_OPS_APPROVAL' | 'EXEC_FAILED';
    }>
  ): Promise<OpsQueue>;
  /** Plain-language posting instructions for the Execute drawer. */
  instructions(txnId: string): Promise<string[]>;
  /**
   * First officer: record what happened when they paid in GAPS (or posted in Eazybankz) — references, or the
   * failure and its reason. TreasuryDesk never sends or holds money.
   */
  record(txnId: string, rec: wf.PaymentRecord, version?: number): Promise<TreasuryTxn>;
  /** Second officer: approve the payment record. A successful payment executes the transaction. */
  approve(txnId: string, version?: number): Promise<ExecuteResult>;
  /** Second officer: send the payment record back to be corrected. */
  returnPosting(txnId: string, reason: string, version?: number): Promise<TreasuryTxn>;
}

function payoutOf(db: Db, t: TreasuryTxn): string {
  return add(
    ZERO,
    ...db.vouchers.filter((v) => v.txnId === t.id && paysOut(v)).map((v) => v.netAmt)
  );
}

function describe(db: Db, t: TreasuryTxn, v: Voucher): string[] {
  const inv = findById(db, 'investments', t.investmentId);
  const src = findById(db, 'accounts', t.sourceAccountId);
  const pa = db.accounts.find((a) => a.customerId === t.customerId && a.productCode === 'PA');
  const out: string[] = [];
  const pay = v.payment;
  const dest = pay
    ? pay.bankCode === INTERNAL_BANK_CODE
      ? `internal account ${pay.accountNo} (${pay.benefName})`
      : `${pay.benefName}, ${pay.bankName}, account ${pay.accountNo} via GAPS`
    : '';
  const payoutLines = (): string[] => {
    const lines: string[] = [];
    const cot = v.cotAmt ?? ZERO;
    if (src) {
      const extras = [
        isPositive(v.feeAmt) ? `${formatNaira(v.feeAmt)} transfer charge` : '',
        isPositive(cot) ? `${formatNaira(cot)} COT` : '',
      ].filter(Boolean);
      lines.push(
        `${v.voucherNo}: debit ${src.productCode} ${src.accountNo} with ${formatNaira(add(v.netAmt, v.feeAmt, cot))}${extras.length ? ` (including ${extras.join(' and ')})` : ''}.`
      );
    } else if (inv)
      lines.push(
        `${v.voucherNo}: debit investment ${inv.investmentRef}${isPositive(v.chargeAmt) ? `, book the ${formatNaira(v.chargeAmt)} pre-liquidation charge to income` : ''}${isPositive(v.whtAmt) ? `, post ${formatNaira(v.whtAmt)} WHT to the WHT payable account` : ''}${isPositive(cot) ? `, book the ${formatNaira(cot)} COT to income` : ''}.`
      );
    if (pay && isPositive(v.netAmt)) lines.push(`Pay ${formatNaira(v.netAmt)} to ${dest}.`);
    return lines;
  };
  const rebookLine = (how: 'close' | 'rebook') =>
    `${v.voucherNo}: ${how === 'close' ? `close ${inv?.investmentRef ?? 'the investment'} and rebook` : 'rebook the remainder,'} ${formatNaira(v.rollAmt)} at ${v.newRate}% for ${v.newTenorDays} days from ${v.effectiveDate} (matures ${v.newMaturityDate}).`;
  switch (v.voucherType) {
    case 'FI':
      if (t.scenarioCode === 'INFLOW_ACCOUNT') {
        const where = v.rows.find((r) => r.label === 'Credit to')?.value ?? '';
        const acc = v.rows.find((r) => r.label === 'Account number')?.value ?? '';
        out.push(
          `${v.voucherNo}: credit ${formatNaira(v.principalAmt)} from funds received to ${where}${acc && acc !== '—' ? ` ${acc}` : ''}, value ${v.effectiveDate}.`
        );
      } else
        out.push(
          `${v.voucherNo}: book a new investment of ${formatNaira(v.principalAmt)} at ${v.newRate}% for ${v.newTenorDays} days, effective ${v.effectiveDate}, from funds received.`
        );
      break;
    case 'FO':
      out.push(...payoutLines());
      // Partial pre-liquidation: the same voucher rebooks what remains.
      if (v.newRate && isPositive(v.rollAmt)) out.push(rebookLine('rebook'));
      break;
    case 'RO':
      out.push(rebookLine('close'));
      // Rollover B, C and D: the same voucher also pays out.
      if (pay && isPositive(v.netAmt)) out.push(...payoutLines());
      break;
    case 'CT':
      out.push(
        src
          ? `${v.voucherNo}: debit Current account ${src.accountNo} with ${formatNaira(v.cotAmt)} commission on turnover and book it to income.`
          : `${v.voucherNo}: post ${formatNaira(v.cotAmt)} commission on turnover against Call placement ${inv?.investmentRef} and book it to income.`
      );
      break;
    case 'TS':
      if (t.scenarioCode === 'TRANSFER_SS_PA')
        out.push(
          `${v.voucherNo}: debit SS ${src?.accountNo} and credit PA ${pa?.accountNo} with ${formatNaira(v.principalAmt)}.`
        );
      else if (t.scenarioCode === 'TRANSFER_REVERSAL') {
        out.push(
          `${v.voucherNo}: reverse ${inv?.investmentRef} and rebook ${formatNaira(v.rollAmt)} at ${v.newRate}% for ${v.newTenorDays} days from ${v.effectiveDate}.`
        );
        if (!isZero(v.netAmt))
          out.push(
            `Settle the difference of ${formatNaira(v.netAmt)} against PA ${pa?.accountNo}.`
          );
      } else
        out.push(
          `${v.voucherNo}: debit PA ${src?.accountNo} with ${formatNaira(v.principalAmt)} and book a new ${t.scenarioCode === 'TRANSFER_PA_CP' ? 'Commercial Paper' : 'Call Placement'} at ${v.newRate}% for ${v.newTenorDays} days.`
        );
      break;
  }
  return out;
}

/** The payment record awaiting a second officer, for display. */
export function preparedOf(db: Db, txnId: string): OpsRow['prepared'] {
  const prep = wf.preparedPosting(db, txnId);
  return prep
    ? {
        outcome: prep.outcome,
        cbsPostingRef: prep.cbsPostingRef ?? '',
        gapsRef: prep.gapsRef,
        failureReason: prep.failureReason,
        preparedBy: findById(db, 'users', prep.executedBy)?.fullName ?? prep.executedBy,
        preparedAt: prep.executedAt,
      }
    : null;
}

function result(txnId: string): ExecuteResult {
  const db = getDb();
  const txn = getById(db, 'txns', txnId, 'transaction');
  const execution = db.executions
    .filter((e) => e.txnId === txnId)
    .sort((a, b) => a.attemptNo - b.attemptNo)
    .pop()!;
  return { txn, execution, ok: execution.status === 'SUCCESS' };
}

export const mockOperationsService: OperationsService = {
  queue: (q = {}) =>
    run(() => {
      const u = requireUser();
      const db = getDb();
      const f = q.filters ?? {};
      const rows: OpsRow[] = filterTxns(
        db,
        {
          search: f.search,
          status: f.status ?? ['PENDING_OPERATIONS', 'PENDING_OPS_APPROVAL', 'EXEC_FAILED'],
        },
        nowIso()
      ).map((r) => {
        const ex = db.executions.filter((e) => e.txnId === r.id);
        return {
          ...r,
          gapsRequired: wf.gapsRequired(db, r),
          attempts: ex.filter((e) => e.status === 'SUCCESS' || e.status === 'FAILED').length,
          lastFailure: ex.filter((e) => e.status === 'FAILED').pop()?.failureReason ?? null,
          payoutAmt: payoutOf(db, r),
          prepared: preparedOf(db, r.id),
          approveBlocker: wf.opsApprovalBlocker(db, r as TreasuryTxn, u),
        };
      });
      return {
        ...paginate(rows, { sort: { field: 'submittedAt', dir: 'asc' }, ...q }),
        totalToPay: add(ZERO, ...rows.map((r) => r.payoutAmt)),
      };
    }),
  instructions: (txnId) =>
    run(() => {
      const db = getDb();
      const t = getById(db, 'txns', txnId, 'transaction');
      const lines = db.vouchers
        .filter((v) => v.txnId === t.id)
        .sort((a, b) => a.seqNo - b.seqNo)
        .flatMap((v) => describe(db, t, v));
      lines.push(
        wf.gapsRequired(db, t)
          ? 'Post it in Eazybankz and make the payment in GAPS, then record the outcome here: the Eazybankz and GAPS references, or why it failed. A second Operations officer approves the record.'
          : 'Internal only (no GAPS): post it in Eazybankz, then record the posting reference here. A second Operations officer approves the record.'
      );
      return lines;
    }),
  record: (txnId, rec, version) => run(() => wf.recordExecution(ctx(['OPS']), txnId, rec, version)),
  approve: (txnId, version) =>
    run(() => {
      wf.approveExecution(ctx(['OPS']), txnId, version);
      return result(txnId);
    }),
  returnPosting: (txnId, reason, version) =>
    run(() => wf.returnExecution(ctx(['OPS']), txnId, reason, version)),
};

export const httpOperationsService: OperationsService = {
  queue: (q) => http.get('/operations/queue', q as Record<string, unknown>),
  instructions: (txnId) => http.get(`/operations/${txnId}/instructions`),
  record: (txnId, rec, version) => http.post(`/operations/${txnId}/record`, { ...rec, version }),
  approve: (txnId, version) => http.post(`/operations/${txnId}/approve`, { version }),
  returnPosting: (txnId, reason, version) =>
    http.post(`/operations/${txnId}/return`, { reason, version }),
};

export const operationsService: OperationsService = USE_MOCK
  ? mockOperationsService
  : httpOperationsService;
