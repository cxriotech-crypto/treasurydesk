import type { Customer, Execution, Instruction, TreasuryTxn, Voucher } from '@/domain/types';
import { APPROVAL_LEVELS, VOUCHER_TYPE_META } from '@/domain/codes';
import { COMPANY_NAME } from '@/domain/rules';
import { todayLagos } from '@/lib/dates';
import { amountInWords } from '@/lib/words';
import type { Db } from '@/data/db';
import { getDb } from '@/data/store';
import { AppError, getById } from '@/data/repo';
import { USE_MOCK, http, run } from './core';
import { canSeeCustomer } from './scope';
import { userName } from './transactionsService';
import * as wf from './workflow';

export interface SignatureBox {
  levelNo: number;
  roleLabel: string;
  signerName: string | null;
  signedAt: string | null;
}

export interface PrintableVoucher {
  companyName: string;
  title: string;
  voucher: Omit<Voucher, 'id' | 'version' | 'txnId' | 'createdAt'> & { id: string | null };
  txn: Pick<TreasuryTxn, 'id' | 'txnRef' | 'status' | 'scenarioCode' | 'cycleNo'>;
  customer: Pick<Customer, 'customerName' | 'cifNo' | 'address'>;
  instruction: Pick<Instruction, 'channel' | 'receivedDate' | 'purpose'> | null;
  /** The amount printed in words (net amount, or roll amount for roll-over slips). */
  headlineAmount: string;
  amountInWords: string;
  signatures: SignatureBox[];
  execution:
    | (Pick<Execution, 'cbsPostingRef' | 'gapsRef' | 'executedAt'> & { executedByName: string })
    | null;
  isDraft: boolean;
  siblingCount: number;
}

export interface VouchersService {
  listByTxn(txnId: string): Promise<Voucher[]>;
  /** Printable issued voucher. */
  printable(voucherId: string): Promise<PrintableVoucher>;
  /** Printable draft (not yet submitted) computed live; seqNo 1 or 2. */
  printableDraft(txnId: string, seqNo: number): Promise<PrintableVoucher>;
}

function headline(v: Pick<Voucher, 'voucherType' | 'netAmt' | 'rollAmt' | 'principalAmt'>): string {
  if (v.voucherType === 'RO') return v.rollAmt;
  if (v.voucherType === 'FI' || v.voucherType === 'TS') return v.principalAmt;
  return v.netAmt;
}

function assemble(
  db: Db,
  t: TreasuryTxn,
  v: PrintableVoucher['voucher'],
  isDraft: boolean,
  siblingCount: number
): PrintableVoucher {
  if (!canSeeCustomer(t.customerId))
    throw new AppError('You do not have access to this voucher.', 'FORBIDDEN');
  const c = getById(db, 'customers', t.customerId, 'customer');
  const ins = db.instructions.find((i) => i.txnId === t.id) ?? null;
  const approvals = db.approvals.filter(
    (a) => a.txnId === t.id && a.cycleNo === t.cycleNo && a.action === 'APPROVE'
  );
  const ex = db.executions.filter((e) => e.txnId === t.id && e.status === 'SUCCESS').pop();
  const amt = headline(v);
  return {
    companyName: COMPANY_NAME,
    title: VOUCHER_TYPE_META[v.voucherType].title,
    voucher: v,
    txn: {
      id: t.id,
      txnRef: t.txnRef,
      status: t.status,
      scenarioCode: t.scenarioCode,
      cycleNo: t.cycleNo,
    },
    customer: { customerName: c.customerName, cifNo: c.cifNo, address: c.address },
    instruction: ins
      ? { channel: ins.channel, receivedDate: ins.receivedDate, purpose: ins.purpose }
      : null,
    headlineAmount: amt,
    amountInWords: amountInWords(amt),
    signatures: APPROVAL_LEVELS.map((l) => {
      const a = isDraft ? undefined : approvals.find((x) => x.levelNo === l.levelNo);
      return {
        levelNo: l.levelNo,
        roleLabel: l.label,
        signerName: a ? userName(db, a.userId) : null,
        signedAt: a?.actedAt ?? null,
      };
    }),
    execution:
      ex && !isDraft
        ? {
            cbsPostingRef: ex.cbsPostingRef,
            gapsRef: ex.gapsRef,
            executedAt: ex.executedAt,
            executedByName: userName(db, ex.executedBy),
          }
        : null,
    isDraft,
    siblingCount,
  };
}

export const mockVouchersService: VouchersService = {
  listByTxn: (txnId) =>
    run(() =>
      getDb()
        .vouchers.filter((v) => v.txnId === txnId)
        .sort((a, b) => a.seqNo - b.seqNo)
    ),
  printable: (voucherId) =>
    run(() => {
      const db = getDb();
      const v = getById(db, 'vouchers', voucherId, 'voucher');
      const t = getById(db, 'txns', v.txnId, 'transaction');
      const count = db.vouchers.filter((x) => x.txnId === t.id).length;
      // A returned transaction's vouchers are being corrected: print them as drafts.
      return assemble(db, t, v, t.status === 'RETURNED', count);
    }),
  printableDraft: (txnId, seqNo) =>
    run(() => {
      const db = getDb();
      const t = getById(db, 'txns', txnId, 'transaction');
      const comp = wf.computeFor(db, t, todayLagos());
      const draft = comp.vouchers.find((v) => v.seqNo === seqNo) ?? comp.vouchers[0];
      if (!draft) throw new AppError('Nothing to print yet.', 'NOT_FOUND');
      const issued = db.vouchers.find((x) => x.txnId === t.id && x.seqNo === draft.seqNo);
      return assemble(
        db,
        t,
        { ...draft, id: null, voucherNo: issued?.voucherNo ?? 'DRAFT' },
        true,
        comp.vouchers.length
      );
    }),
};

export const httpVouchersService: VouchersService = {
  listByTxn: (txnId) => http.get(`/transactions/${txnId}/vouchers`),
  printable: (voucherId) => http.get(`/vouchers/${voucherId}/printable`),
  printableDraft: (txnId, seqNo) => http.get(`/transactions/${txnId}/vouchers/draft`, { seqNo }),
};

export const vouchersService: VouchersService = USE_MOCK
  ? mockVouchersService
  : httpVouchersService;
