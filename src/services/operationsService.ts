import type { Execution, ListQuery, ListResult, TreasuryTxn, Voucher } from '@/domain/types';
import { INTERNAL_BANK_CODE } from '@/domain/rules';
import { nowIso } from '@/lib/dates';
import { formatNaira } from '@/lib/format';
import { add, isPositive, isZero, ZERO } from '@/lib/money';
import type { Db } from '@/data/db';
import { getDb } from '@/data/store';
import { findById, getById, nextCounter, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run, runNow, sleep } from './core';
import { filterTxns, type TxnRow } from './transactionsService';
import * as wf from './workflow';

export interface OpsRow extends TxnRow {
  gapsRequired: boolean;
  attempts: number;
  lastFailure: string | null;
  payoutAmt: string;
  /** The posting keyed by the first officer, awaiting a second. */
  prepared: { cbsPostingRef: string; preparedBy: string; preparedAt: string } | null;
  /** Why the signed-in officer cannot approve the keyed posting, or null. */
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
  /** First officer: key the Eazybankz posting reference. Nothing is posted yet. */
  prepare(txnId: string, cbsPostingRef: string, version?: number): Promise<TreasuryTxn>;
  /**
   * Second officer: approve the keyed posting, which executes it — sending it to GAPS (simulated,
   * ~2 s, fails gapsFailureRate% of the time) where money leaves the bank.
   */
  approve(txnId: string, version?: number): Promise<ExecuteResult>;
  /** Second officer: send the keyed posting back to be corrected. */
  returnPosting(txnId: string, reason: string, version?: number): Promise<TreasuryTxn>;
}

function payoutOf(db: Db, t: TreasuryTxn): string {
  return add(
    ZERO,
    ...db.vouchers.filter((v) => v.txnId === t.id && v.voucherType === 'FO').map((v) => v.netAmt)
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
  switch (v.voucherType) {
    case 'FI':
      out.push(
        `${v.voucherNo}: book a new investment of ${formatNaira(v.principalAmt)} at ${v.newRate}% for ${v.newTenorDays} days, effective ${v.effectiveDate}, from funds received.`
      );
      break;
    case 'FO':
      if (src)
        out.push(
          `${v.voucherNo}: debit ${src.productCode} ${src.accountNo} with ${formatNaira(add(v.netAmt, v.feeAmt))}${isPositive(v.feeAmt) ? ` (including ${formatNaira(v.feeAmt)} transfer charge)` : ''}.`
        );
      else if (inv)
        out.push(
          `${v.voucherNo}: debit investment ${inv.investmentRef}${isPositive(v.chargeAmt) ? `, book the ${formatNaira(v.chargeAmt)} pre-liquidation charge to income` : ''}${isPositive(v.whtAmt) ? `, post ${formatNaira(v.whtAmt)} WHT to the WHT payable account` : ''}.`
        );
      if (pay && isPositive(v.netAmt)) out.push(`Pay ${formatNaira(v.netAmt)} to ${dest}.`);
      break;
    case 'RO':
      out.push(
        `${v.voucherNo}: close ${inv?.investmentRef ?? 'the investment'} and rebook ${formatNaira(v.rollAmt)} at ${v.newRate}% for ${v.newTenorDays} days from ${v.effectiveDate} (matures ${v.newMaturityDate}).`
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

function gapsRef(db: Db): string {
  const d = nowIso().slice(0, 10).replace(/-/g, '');
  return `GAPS-${d}-${String(nextCounter(db, 'gapsRef') % 1_000_000).padStart(6, '0')}`;
}

/** Whether approving will call GAPS (so the screen can show the 2-second wait). */
function runNowGapsCheck(txnId: string): boolean {
  const db = getDb();
  const t = findById(db, 'txns', txnId);
  return !!t && wf.gapsRequired(db, t);
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
        const prep = wf.preparedPosting(db, r.id);
        return {
          ...r,
          gapsRequired: wf.gapsRequired(db, r),
          attempts: ex.filter((e) => e.status === 'SUCCESS' || e.status === 'FAILED').length,
          lastFailure: ex.filter((e) => e.status === 'FAILED').pop()?.failureReason ?? null,
          payoutAmt: payoutOf(db, r),
          prepared: prep
            ? {
                cbsPostingRef: prep.cbsPostingRef ?? '',
                preparedBy: findById(db, 'users', prep.executedBy)?.fullName ?? prep.executedBy,
                preparedAt: prep.executedAt,
              }
            : null,
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
          ? 'Key the Eazybankz posting reference. A second Operations officer approves it, which sends the payment to GAPS.'
          : 'Internal only: key the Eazybankz posting reference. A second Operations officer approves it to complete execution.'
      );
      return lines;
    }),
  prepare: (txnId, cbsPostingRef, version) =>
    run(() => wf.prepareExecution(ctx(['OPS']), txnId, cbsPostingRef, version)),
  approve: async (txnId, version) => {
    const needsGaps = runNowGapsCheck(txnId);
    if (needsGaps && typeof window !== 'undefined') await sleep(2000);
    return runNow(() => {
      const c = ctx(['OPS']);
      const db = getDb();
      const t = getById(db, 'txns', txnId, 'transaction');
      let outcome: wf.GapsOutcome | null = null;
      if (wf.gapsRequired(db, t)) {
        const fail = Math.random() * 100 < db.settings.values.gapsFailureRate;
        outcome = fail
          ? {
              ok: false,
              reason:
                wf.GAPS_FAILURE_REASONS[Math.floor(Math.random() * wf.GAPS_FAILURE_REASONS.length)],
            }
          : { ok: true, gapsRef: gapsRef(db) };
      }
      wf.approveExecution(c, txnId, outcome, version);
      return result(txnId);
    });
  },
  returnPosting: (txnId, reason, version) =>
    run(() => wf.returnExecution(ctx(['OPS']), txnId, reason, version)),
};

export const httpOperationsService: OperationsService = {
  queue: (q) => http.get('/operations/queue', q as Record<string, unknown>),
  instructions: (txnId) => http.get(`/operations/${txnId}/instructions`),
  prepare: (txnId, cbsPostingRef, version) =>
    http.post(`/operations/${txnId}/prepare`, { cbsPostingRef, version }),
  approve: (txnId, version) => http.post(`/operations/${txnId}/approve`, { version }),
  returnPosting: (txnId, reason, version) =>
    http.post(`/operations/${txnId}/return`, { reason, version }),
};

export const operationsService: OperationsService = USE_MOCK
  ? mockOperationsService
  : httpOperationsService;
