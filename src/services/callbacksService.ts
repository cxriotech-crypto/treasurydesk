import type { CallbackLog, ListQuery, ListResult } from '@/domain/types';
import type { CallbackOutcome } from '@/domain/codes';
import { nowIso } from '@/lib/dates';
import { getDb } from '@/data/store';
import { findById, matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run } from './core';
import { canSeeCustomer, visibleCustomerIds } from './scope';
import { filterTxns, userName, type TxnRow } from './transactionsService';
import * as wf from './workflow';

export interface CallbackFilters {
  search?: string;
  txnId?: string;
  customerId?: string;
  officerId?: string;
  outcome?: CallbackOutcome;
  dateFrom?: string;
  dateTo?: string;
}

export interface CallbackRow extends CallbackLog {
  txnRef: string;
  customerName: string;
  cifNo: string;
  officerName: string;
}

export interface CallbackQueueRow extends TxnRow {
  regPhone: string;
  lastOutcome: CallbackOutcome | null;
  attempts: number;
}

export interface CallbacksService {
  list(q?: ListQuery<CallbackFilters>): Promise<ListResult<CallbackRow>>;
  /** Transactions waiting for a customer call-back (AO: own customers only). */
  queue(): Promise<CallbackQueueRow[]>;
  log(txnId: string, data: wf.CallbackData): Promise<CallbackLog>;
}

export const mockCallbacksService: CallbacksService = {
  list: (q = {}) =>
    run(() => {
      const db = getDb();
      const f = q.filters ?? {};
      const scope = visibleCustomerIds();
      const rows: CallbackRow[] = db.callbacks
        .filter(
          (c) =>
            canSeeCustomer(c.customerId, scope) &&
            (!f.txnId || c.txnId === f.txnId) &&
            (!f.customerId || c.customerId === f.customerId) &&
            (!f.officerId || c.officerId === f.officerId) &&
            (!f.outcome || c.outcome === f.outcome) &&
            (!f.dateFrom || c.callDate >= f.dateFrom) &&
            (!f.dateTo || c.callDate <= f.dateTo)
        )
        .map((c) => {
          const cust = findById(db, 'customers', c.customerId);
          return {
            ...c,
            txnRef: findById(db, 'txns', c.txnId)?.txnRef ?? '',
            customerName: cust?.customerName ?? '',
            cifNo: cust?.cifNo ?? '',
            officerName: userName(db, c.officerId),
          };
        })
        .filter((r) =>
          matchesSearch(f.search, r.txnRef, r.customerName, r.cifNo, r.phoneCalled, r.officerName)
        );
      return paginate(rows, { sort: { field: 'createdAt', dir: 'desc' }, ...q });
    }),
  queue: () =>
    run(() => {
      requireUser();
      const db = getDb();
      return filterTxns(db, { status: ['VERIFICATION', 'RETURNED'] }, nowIso())
        .filter((t) => {
          const ctl = (code: string) =>
            db.controls.find((c) => c.txnId === t.id && c.controlCode === code)?.state;
          return ctl('C02') === 'PASSED' && ctl('C03') !== 'PASSED';
        })
        .map((t) => {
          const logs = db.callbacks
            .filter((c) => c.txnId === t.id)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return {
            ...t,
            regPhone: findById(db, 'customers', t.customerId)?.regPhone ?? '',
            lastOutcome: logs.length ? logs[logs.length - 1].outcome : null,
            attempts: logs.length,
          };
        })
        .sort((a, b) => (a.slaDueAt ?? '').localeCompare(b.slaDueAt ?? ''));
    }),
  log: (txnId, data) => run(() => wf.logCallback(ctx(['AO']), txnId, data)),
};

export const httpCallbacksService: CallbacksService = {
  list: (q) => http.get('/callbacks', q as Record<string, unknown>),
  queue: () => http.get('/callbacks/queue'),
  log: (txnId, data) => http.post(`/transactions/${txnId}/callbacks`, data),
};

export const callbacksService: CallbacksService = USE_MOCK
  ? mockCallbacksService
  : httpCallbacksService;
