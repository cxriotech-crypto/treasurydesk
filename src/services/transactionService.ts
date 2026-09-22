// Backend integration point: replace mockImpl with httpImpl when API_BASE_URL is available
import type { TreasuryTxn, ListParams, ListResult, TxnStatus, ApprovalLevel, ApprovalAction } from '@/types';
import { SEED_TRANSACTIONS } from './seedData';
import { nowLagosISO } from '@/lib/format';

const STORAGE_KEY = 'td_transactions';
const DELAY = 350;

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

function load(): TreasuryTxn[] {
  if (typeof window === 'undefined') return JSON.parse(JSON.stringify(SEED_TRANSACTIONS));
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(SEED_TRANSACTIONS));
  } catch {
    return JSON.parse(JSON.stringify(SEED_TRANSACTIONS));
  }
}

function save(data: TreasuryTxn[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetTransactions() {
  save(JSON.parse(JSON.stringify(SEED_TRANSACTIONS)));
}

export interface TransactionService {
  list(params: ListParams): Promise<ListResult<TreasuryTxn>>;
  getById(id: string): Promise<TreasuryTxn | null>;
  create(txn: Omit<TreasuryTxn, 'id' | 'version'>): Promise<TreasuryTxn>;
  update(id: string, patch: Partial<TreasuryTxn>): Promise<TreasuryTxn>;
  approve(txnId: string, level: ApprovalLevel, action: ApprovalAction, comment: string, approverId: string, approverName: string): Promise<TreasuryTxn>;
  execute(txnId: string, executionRef: string, notes: string, operatorId: string, operatorName: string): Promise<TreasuryTxn>;
  confirm(txnId: string): Promise<TreasuryTxn>;
}

const APPROVAL_SEQUENCE: ApprovalLevel[] = ['TO', 'HT', 'MIS', 'AUDIT', 'MD'];
const APPROVAL_STATUS_MAP: Record<ApprovalLevel, TxnStatus> = {
  TO: 'PENDING_HEAD_TREASURY',
  HT: 'PENDING_MIS',
  MIS: 'PENDING_AUDIT',
  AUDIT: 'PENDING_MD',
  MD: 'PENDING_OPERATIONS',
};

// Pending statuses for approval queue filtering
export const PENDING_APPROVAL_STATUSES: TxnStatus[] = [
  'PENDING_HEAD_TREASURY', 'PENDING_MIS', 'PENDING_AUDIT', 'PENDING_MD',
  // Legacy
  'PENDING_TO', 'PENDING_HT',
];

export const PENDING_OPS_STATUSES: TxnStatus[] = ['PENDING_OPERATIONS', 'PENDING_OPS'];

export const transactionService: TransactionService = {
  async list({ page = 1, pageSize = 20, sort, filters }: ListParams) {
    await delay(DELAY);
    let items = load();

    // Apply filters
    if (filters) {
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        items = items.filter((t) => statuses.includes(t.status));
      }
      if (filters.type) {
        const types = Array.isArray(filters.type) ? filters.type : [filters.type];
        items = items.filter((t) => types.includes(t.type));
      }
      if (filters.customerId) {
        items = items.filter((t) => t.customerId === filters.customerId);
      }
      if (filters.search && typeof filters.search === 'string') {
        const q = filters.search.toLowerCase();
        items = items.filter(
          (t) =>
            t.ref.toLowerCase().includes(q) ||
            t.customerName.toLowerCase().includes(q) ||
            t.customerCif.toLowerCase().includes(q) ||
            (t.voucherNo ?? '').toLowerCase().includes(q)
        );
      }
      if (filters.dateFrom && typeof filters.dateFrom === 'string') {
        items = items.filter((t) => t.effectiveDate >= filters.dateFrom!);
      }
      if (filters.dateTo && typeof filters.dateTo === 'string') {
        items = items.filter((t) => t.effectiveDate <= filters.dateTo!);
      }
      if (filters.approvalLevel) {
        items = items.filter((t) => t.currentApprovalLevel === filters.approvalLevel);
      }
      if (filters.initiatedById && typeof filters.initiatedById === 'string') {
        items = items.filter((t) => t.initiatedById === filters.initiatedById);
      }
      if (filters.slaBreached) {
        items = items.filter((t) => t.slaBreached === true);
      }
    }

    // Apply sort
    if (sort) {
      items = [...items].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sort.field];
        const bv = (b as Record<string, unknown>)[sort.field];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    } else {
      items = [...items].sort(
        (a, b) => b.initiatedAt.localeCompare(a.initiatedAt)
      );
    }

    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total };
  },

  async getById(id: string) {
    await delay(DELAY);
    return load().find((t) => t.id === id) ?? null;
  },

  async create(txn) {
    await delay(DELAY);
    const all = load();
    const newTxn: TreasuryTxn = {
      ...txn,
      id: `txn-${Date.now()}`,
      version: 1,
    };
    all.unshift(newTxn);
    save(all);
    return newTxn;
  },

  async update(id: string, patch: Partial<TreasuryTxn>) {
    await delay(DELAY);
    const all = load();
    const idx = all.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Transaction ${id} not found`);
    const updated = { ...all[idx], ...patch, version: all[idx].version + 1, updatedAt: nowLagosISO() };
    all[idx] = updated;
    save(all);
    return updated;
  },

  async approve(txnId, level, action, comment, approverId, approverName) {
    await delay(DELAY);
    const all = load();
    const idx = all.findIndex((t) => t.id === txnId);
    if (idx === -1) throw new Error(`Transaction ${txnId} not found`);
    const txn = { ...all[idx] };
    const approvals = txn.approvals.map((a) => {
      if (a.level === level && a.status === 'PENDING') {
        return { ...a, action, comment, approver: approverName, approverId, actionAt: nowLagosISO(), status: action as 'APPROVED' | 'REJECTED' | 'RETURNED', version: a.version + 1 };
      }
      return a;
    });
    txn.approvals = approvals;

    if (action === 'APPROVED') {
      const currentIdx = APPROVAL_SEQUENCE.indexOf(level);
      if (currentIdx === APPROVAL_SEQUENCE.length - 1) {
        txn.status = 'PENDING_OPERATIONS';
        txn.currentApprovalLevel = undefined;
      } else {
        const nextLevel = APPROVAL_SEQUENCE[currentIdx + 1];
        txn.status = APPROVAL_STATUS_MAP[nextLevel];
        txn.currentApprovalLevel = nextLevel;
      }
    } else if (action === 'REJECTED') {
      txn.status = 'REJECTED';
      txn.currentApprovalLevel = undefined;
      txn.approvals = txn.approvals.map((a) =>
        a.status === 'PENDING' ? { ...a, status: 'SKIPPED' } : a
      );
    } else if (action === 'RETURNED') {
      txn.status = 'RETURNED';
      txn.currentApprovalLevel = 'HT';
      txn.approvals = txn.approvals.map((a) =>
        a.level !== 'TO' ? { ...a, status: 'PENDING', action: undefined, approver: undefined, approverId: undefined, actionAt: undefined, comment: undefined } : a
      );
    }

    txn.version += 1;
    txn.updatedAt = nowLagosISO();
    all[idx] = txn;
    save(all);
    return txn;
  },

  async execute(txnId, executionRef, notes, operatorId, operatorName) {
    await delay(DELAY);
    const all = load();
    const idx = all.findIndex((t) => t.id === txnId);
    if (idx === -1) throw new Error(`Transaction ${txnId} not found`);
    const updated = {
      ...all[idx],
      status: 'EXECUTED' as TxnStatus,
      executionRef,
      executionNotes: notes,
      executedBy: operatorName,
      executedAt: nowLagosISO(),
      version: all[idx].version + 1,
      updatedAt: nowLagosISO(),
    };
    all[idx] = updated;
    save(all);
    return updated;
  },

  async confirm(txnId) {
    await delay(DELAY);
    const all = load();
    const idx = all.findIndex((t) => t.id === txnId);
    if (idx === -1) throw new Error(`Transaction ${txnId} not found`);
    const updated = {
      ...all[idx],
      status: 'CONFIRMED' as TxnStatus,
      confirmedAt: nowLagosISO(),
      version: all[idx].version + 1,
      updatedAt: nowLagosISO(),
    };
    all[idx] = updated;
    save(all);
    return updated;
  },
};