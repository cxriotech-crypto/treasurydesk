import type { ListQuery, ListResult, TreasuryTxn } from '@/domain/types';
import { levelForRole, type ScenarioCode, type TxnType } from '@/domain/codes';
import { minutesBetween, nowIso } from '@/lib/dates';
import { add, ZERO } from '@/lib/money';
import { getDb } from '@/data/store';
import { AppError, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run } from './core';
import { filterTxns, type TxnRow } from './transactionsService';
import * as wf from './workflow';

export interface ApprovalFilters {
  search?: string;
  txnType?: TxnType;
  scenarioCode?: ScenarioCode;
  slaBreached?: boolean;
}

export interface ApprovalRow extends TxnRow {
  /** Minutes since it reached this level. */
  waitingMinutes: number;
  /** Why the signed-in user cannot approve (maker-checker etc.), or null. */
  blocker: string | null;
}

export interface ApprovalQueue extends ListResult<ApprovalRow> {
  levelLabel: string;
  totalAmount: string;
  oldestMinutes: number;
}

export interface BulkResult {
  approved: string[];
  failed: { id: string; txnRef: string; reason: string }[];
}

export interface ApprovalsService {
  /** Queue for the signed-in approver's own level. */
  queue(q?: ListQuery<ApprovalFilters>): Promise<ApprovalQueue>;
  approve(txnId: string, sign: wf.SignArgs, version?: number): Promise<TreasuryTxn>;
  returnToMaker(txnId: string, comments: string, version?: number): Promise<TreasuryTxn>;
  reject(txnId: string, reason: string, version?: number): Promise<TreasuryTxn>;
  /** Approve several with one signature. */
  bulkApprove(txnIds: string[], sign: wf.SignArgs): Promise<BulkResult>;
}

const APPROVER_ROLES = ['HT', 'MIS', 'AUD', 'MD'] as const;

export const mockApprovalsService: ApprovalsService = {
  queue: (q = {}) =>
    run(() => {
      const u = requireUser([...APPROVER_ROLES]);
      const level = levelForRole(u.roleCode)!;
      const db = getDb();
      const now = nowIso();
      const rows: ApprovalRow[] = filterTxns(
        db,
        { ...(q.filters ?? {}), status: level.pendingStatus! },
        now
      ).map((r) => {
        const arrived = db.audit
          .filter(
            (e) =>
              e.entityId === r.id &&
              e.entity === 'TreasuryTxn' &&
              (e.after as { status?: string } | null)?.status === r.status
          )
          .map((e) => e.ts)
          .pop();
        return {
          ...r,
          waitingMinutes: minutesBetween(arrived ?? r.updatedAt, now),
          blocker: wf.approvalBlocker(db, r as TreasuryTxn, u),
        };
      });
      const paged = paginate(rows, { sort: { field: 'waitingMinutes', dir: 'desc' }, ...q });
      return {
        ...paged,
        levelLabel: level.label,
        totalAmount: add(ZERO, ...rows.map((r) => r.headlineAmt)),
        oldestMinutes: rows.reduce((m, r) => Math.max(m, r.waitingMinutes), 0),
      };
    }),
  approve: (txnId, sign, version) =>
    run(() => wf.approve(ctx([...APPROVER_ROLES]), txnId, sign, version)),
  returnToMaker: (txnId, comments, version) =>
    run(() => wf.returnToMaker(ctx([...APPROVER_ROLES]), txnId, comments, version)),
  reject: (txnId, reason, version) =>
    run(() => wf.reject(ctx([...APPROVER_ROLES]), txnId, reason, version)),
  bulkApprove: (txnIds, sign) =>
    run(() => {
      if (!txnIds.length) throw new AppError('Select at least one transaction.', 'VALIDATION');
      const out: BulkResult = { approved: [], failed: [] };
      for (const id of txnIds) {
        const t = getDb().txns.find((x) => x.id === id);
        try {
          wf.approve(ctx([...APPROVER_ROLES]), id, sign);
          out.approved.push(id);
        } catch (e) {
          out.failed.push({ id, txnRef: t?.txnRef ?? id, reason: (e as Error).message });
        }
      }
      return out;
    }),
};

export const httpApprovalsService: ApprovalsService = {
  queue: (q) => http.get('/approvals/queue', q as Record<string, unknown>),
  approve: (txnId, sign, version) =>
    http.post(`/transactions/${txnId}/approve`, { ...sign, version }),
  returnToMaker: (txnId, comments, version) =>
    http.post(`/transactions/${txnId}/return`, { comments, version }),
  reject: (txnId, reason, version) =>
    http.post(`/transactions/${txnId}/reject`, { reason, version }),
  bulkApprove: (txnIds, sign) => http.post('/approvals/bulk', { txnIds, ...sign }),
};

export const approvalsService: ApprovalsService = USE_MOCK
  ? mockApprovalsService
  : httpApprovalsService;
