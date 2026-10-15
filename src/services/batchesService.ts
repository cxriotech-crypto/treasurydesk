import type { ListQuery, ListResult, TxnBatch } from '@/domain/types';
import { nowIso, todayLagos } from '@/lib/dates';
import { add, ZERO } from '@/lib/money';
import { getDb } from '@/data/store';
import { getById, matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run } from './core';
import { canSeeCustomer } from './scope';
import { toTxnRow, userName, type TxnRow } from './transactionsService';
import * as wf from './workflow';

export interface BatchItem extends TxnRow {
  /** What the signed-in user can do with this item now. */
  canDecide: boolean;
  /** Why they cannot approve it (not their level, call outstanding…), or null. */
  approveBlocker: string | null;
  /** Why they cannot return or reject it, or null. */
  decideBlocker: string | null;
}

export interface BatchRow extends TxnBatch {
  makerName: string;
  itemCount: number;
  totalAmount: string;
  /** Items at each status, e.g. { PENDING_MIS: 3, COMPLETED: 1 }. */
  statusCounts: Record<string, number>;
  /** Items waiting for the signed-in user. */
  waitingForMe: number;
}

export interface BatchDetail extends BatchRow {
  items: BatchItem[];
}

/** Draft transactions the maker can put into a batch, with the reason any cannot go. */
export interface BatchCandidate extends TxnRow {
  blocker: string | null;
}

export interface BatchesService {
  list(q?: ListQuery<{ search?: string; mine?: boolean }>): Promise<ListResult<BatchRow>>;
  get(id: string): Promise<BatchDetail>;
  /** The maker's transactions that are ready (or nearly ready) to submit. */
  candidates(): Promise<BatchCandidate[]>;
  submit(txnIds: string[], sign: wf.SignArgs, note?: string): Promise<wf.BatchSubmitResult>;
  decide(
    batchId: string,
    decisions: wf.BatchItemDecision[],
    sign: wf.SignArgs
  ): Promise<wf.BatchDecisionResult>;
}

function summarise(batch: TxnBatch): BatchRow {
  const db = getDb();
  const u = requireUser();
  const items = batch.txnIds
    .map((id) => db.txns.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t && canSeeCustomer(t.customerId));
  const statusCounts: Record<string, number> = {};
  for (const t of items) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  return {
    ...batch,
    makerName: userName(db, batch.makerId),
    itemCount: items.length,
    totalAmount: add(ZERO, ...items.map((t) => t.headlineAmt)),
    statusCounts,
    waitingForMe: items.filter((t) => !wf.approvalBlocker(db, t, u)).length,
  };
}

export const mockBatchesService: BatchesService = {
  list: (q = {}) =>
    run(() => {
      const u = requireUser();
      const db = getDb();
      const f = q.filters ?? {};
      const rows = db.batches
        .filter((b) => !f.mine || b.makerId === u.id)
        .map(summarise)
        .filter((b) => b.itemCount > 0 && matchesSearch(f.search, b.batchRef, b.makerName));
      return paginate(rows, { sort: { field: 'createdAt', dir: 'desc' }, ...q });
    }),
  get: (id) =>
    run(() => {
      const u = requireUser();
      const db = getDb();
      const batch = getById(db, 'batches', id, 'batch');
      const now = nowIso();
      const items: BatchItem[] = batch.txnIds
        .map((tid) => db.txns.find((t) => t.id === tid))
        .filter((t): t is NonNullable<typeof t> => !!t && canSeeCustomer(t.customerId))
        .map((t) => {
          const who = wf.approvalBlocker(db, t, u);
          return {
            ...toTxnRow(db, t, now),
            canDecide: !who,
            decideBlocker: who,
            approveBlocker: who ?? wf.approveRequirement(db, t),
          };
        });
      return { ...summarise(batch), items };
    }),
  candidates: () =>
    run(() => {
      const u = requireUser(['TO']);
      const db = getDb();
      const now = nowIso();
      return db.txns
        .filter(
          (t) => t.makerId === u.id && (t.status === 'VERIFICATION' || t.status === 'RETURNED')
        )
        .map((t) => ({
          ...toTxnRow(db, t, now),
          blocker: wf.submitBlocker(db, t, todayLagos()),
        }))
        .sort(
          (a, b) => (a.blocker ? 1 : 0) - (b.blocker ? 1 : 0) || a.txnRef.localeCompare(b.txnRef)
        );
    }),
  submit: (txnIds, sign, note) => run(() => wf.submitBatch(ctx(['TO']), txnIds, sign, note)),
  decide: (batchId, decisions, sign) =>
    run(() => wf.decideBatch(ctx(['AO', 'HT', 'MIS', 'AUD', 'MD']), batchId, decisions, sign)),
};

export const httpBatchesService: BatchesService = {
  list: (q) => http.get('/batches', q as Record<string, unknown>),
  get: (id) => http.get(`/batches/${id}`),
  candidates: () => http.get('/batches/candidates'),
  submit: (txnIds, sign, note) => http.post('/batches', { txnIds, note, ...sign }),
  decide: (batchId, decisions, sign) =>
    http.post(`/batches/${batchId}/decisions`, { decisions, ...sign }),
};

export const batchesService: BatchesService = USE_MOCK ? mockBatchesService : httpBatchesService;
