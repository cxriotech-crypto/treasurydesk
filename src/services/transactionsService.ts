import type {
  Account,
  AppUser,
  Approval,
  AuditEvent,
  CallbackLog,
  ControlCheck,
  Customer,
  Execution,
  Instruction,
  Investment,
  ListQuery,
  ListResult,
  TreasuryTxn,
  TxnComment,
  TxnInput,
  Verification,
  Voucher,
} from '@/domain/types';
import {
  CONTROL_LABELS,
  TXN_STATUSES,
  TXN_STATUS_META,
  levelForStatus,
  type ControlCode,
  type ScenarioCode,
  type TxnStatus,
  type TxnType,
} from '@/domain/codes';
import { reversalIneligibility, slaState, type SlaState } from '@/domain/rules';
import { accruedInterest } from '@/lib/calc';
import { isoDatePart, nowIso, todayLagos } from '@/lib/dates';
import { add, gte, lte } from '@/lib/money';
import type { Db } from '@/data/db';
import { getDb } from '@/data/store';
import { AppError, findById, getById, matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run, runNow, sessionUser } from './core';
import { canSeeCustomer, visibleCustomerIds } from './scope';
import * as wf from './workflow';
import type { TxnComputation } from './voucherBuilder';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TxnFilters {
  search?: string;
  status?: TxnStatus | TxnStatus[];
  txnType?: TxnType;
  scenarioCode?: ScenarioCode;
  customerId?: string;
  investmentId?: string;
  makerId?: string;
  /** Created date range (YYYY-MM-DD, inclusive). */
  dateFrom?: string;
  dateTo?: string;
  amountMin?: string;
  amountMax?: string;
  slaBreached?: boolean;
}

export interface TxnRow extends TreasuryTxn {
  customerName: string;
  cifNo: string;
  makerName: string;
  sla: SlaState | null;
  investmentRef: string | null;
}

export type StageState = 'done' | 'current' | 'todo' | 'failed';

export interface Stage {
  key: string;
  label: string;
  state: StageState;
  at: string | null;
  by: string | null;
}

export interface TxnActions {
  continueDraft: string | null;
  cancel: string | null;
  stop: string | null;
  approve: string | null;
  execute: string | null;
  confirm: string | null;
  reverse: string | null;
  logCallback: string | null;
}

export interface NamedApproval extends Approval {
  userName: string;
}
export interface NamedCallback extends CallbackLog {
  officerName: string;
}
export interface NamedControl extends ControlCheck {
  label: string;
  actorName: string | null;
}
export interface NamedComment extends TxnComment {
  userName: string;
  mine: boolean;
}
export interface NamedExecution extends Execution {
  executedByName: string;
  confirmedByName: string | null;
}
export interface NamedAudit extends AuditEvent {
  userName: string;
}

export interface TxnDetail {
  txn: TreasuryTxn;
  customer: Customer;
  /** The customer's Account Officer — they make the SOP step 3 call-back. */
  accountOfficerName: string;
  maker: AppUser;
  investment: Investment | null;
  sourceAccount: Account | null;
  destAccount: Account | null;
  instruction: Instruction | null;
  verification: Verification | null;
  callbacks: NamedCallback[];
  vouchers: Voucher[];
  approvals: NamedApproval[];
  executions: NamedExecution[];
  controls: NamedControl[];
  comments: NamedComment[];
  audit: NamedAudit[];
  reversalOf: Pick<TreasuryTxn, 'id' | 'txnRef'> | null;
  reversedBy: Pick<TreasuryTxn, 'id' | 'txnRef'> | null;
  resultInvestment: Pick<Investment, 'id' | 'investmentRef' | 'status'> | null;
  sla: SlaState | null;
  stages: Stage[];
  actions: TxnActions;
  gapsRequired: boolean;
  /** Live computation while the transaction is editable. */
  computation: TxnComputation | null;
}

export interface ReversibleTxn {
  id: string;
  txnRef: string;
  scenarioCode: ScenarioCode;
  completedAt: string | null;
  investmentRef: string;
  principalAmt: string;
  intRate: string;
  tenorDays: number;
  disabledReason: string | null;
}

export interface CbsSnapshot {
  syncedAt: string;
  lines: { label: string; value: string; format: 'money' | 'date' | 'rate' | 'days' | 'text' }[];
}

export interface TransactionsService {
  list(q?: ListQuery<TxnFilters>): Promise<ListResult<TxnRow>>;
  /** Counts per status for the status tabs (same filters, status ignored). */
  statusCounts(filters?: Omit<TxnFilters, 'status'>): Promise<Record<TxnStatus | 'ALL', number>>;
  get(id: string): Promise<TxnDetail>;
  /** Live voucher computation for a draft with (unsaved) input. */
  preview(id: string, input: TxnInput): Promise<TxnComputation>;
  create(args: wf.CreateDraftArgs): Promise<TreasuryTxn>;
  saveDraft(id: string, args: wf.UpdateDraftArgs, version?: number): Promise<TreasuryTxn>;
  recordInstruction(id: string, data: wf.InstructionData): Promise<TreasuryTxn>;
  verifySignature(id: string, checks: wf.SignatureChecks): Promise<TreasuryTxn>;
  stop(id: string, reason: string): Promise<TreasuryTxn>;
  logCallback(id: string, data: wf.CallbackData): Promise<CallbackLog>;
  /** Simulated "Refresh from Eazybankz" (~1 s). */
  refreshFromCbs(id: string): Promise<CbsSnapshot>;
  confirmCbs(id: string, data: wf.CbsConfirmation): Promise<TreasuryTxn>;
  signAndSubmit(id: string, sign: wf.SignArgs, version?: number): Promise<TreasuryTxn>;
  cancel(id: string, reason: string, version?: number): Promise<TreasuryTxn>;
  confirmCompletion(id: string, version?: number): Promise<TreasuryTxn>;
  raiseReversal(originalTxnId: string, input?: TxnInput): Promise<TreasuryTxn>;
  /** Completed bookings of a customer that a reversal can correct (wizard step 1). */
  reversible(customerId: string, exceptTxnId?: string): Promise<ReversibleTxn[]>;
  addComment(id: string, body: string): Promise<TxnComment>;
  editComment(commentId: string, body: string, version: number): Promise<TxnComment>;
  deleteComment(commentId: string, version: number): Promise<void>;
}

// ─── Helpers (exported for the other transaction-centred services) ──────────

export function userName(db: Db, id: string | null | undefined): string {
  if (!id) return '—';
  if (id === wf.SYSTEM_USER_ID) return 'System';
  return findById(db, 'users', id)?.fullName ?? id;
}

export function toTxnRow(db: Db, t: TreasuryTxn, now: string): TxnRow {
  const c = findById(db, 'customers', t.customerId);
  return {
    ...t,
    customerName: c?.customerName ?? '',
    cifNo: c?.cifNo ?? '',
    makerName: userName(db, t.makerId),
    sla: slaState(t.slaDueAt, now, t.completedAt),
    investmentRef: findById(db, 'investments', t.investmentId)?.investmentRef ?? null,
  };
}

export function filterTxns(db: Db, f: TxnFilters, now: string): TxnRow[] {
  const scope = visibleCustomerIds();
  const statuses = f.status ? (Array.isArray(f.status) ? f.status : [f.status]) : null;
  return db.txns
    .filter(
      (t) =>
        canSeeCustomer(t.customerId, scope) &&
        (!statuses || statuses.includes(t.status)) &&
        (!f.txnType || t.txnType === f.txnType) &&
        (!f.scenarioCode || t.scenarioCode === f.scenarioCode) &&
        (!f.customerId || t.customerId === f.customerId) &&
        (!f.investmentId ||
          t.investmentId === f.investmentId ||
          t.resultInvestmentId === f.investmentId) &&
        (!f.makerId || t.makerId === f.makerId) &&
        (!f.dateFrom || isoDatePart(t.createdAt) >= f.dateFrom) &&
        (!f.dateTo || isoDatePart(t.createdAt) <= f.dateTo) &&
        (!f.amountMin || gte(t.headlineAmt, f.amountMin)) &&
        (!f.amountMax || lte(t.headlineAmt, f.amountMax))
    )
    .map((t) => toTxnRow(db, t, now))
    .filter(
      (r) =>
        (f.slaBreached === undefined || !!r.sla?.breached === f.slaBreached) &&
        matchesSearch(f.search, r.txnRef, r.customerName, r.cifNo, r.investmentRef)
    );
}

function stagesOf(db: Db, t: TreasuryTxn): Stage[] {
  const ctl = (code: ControlCode) =>
    db.controls.find((c) => c.txnId === t.id && c.controlCode === code)!;
  const defs: [string, string, ControlCode][] = [
    ['instruction', 'Instruction', 'C01'],
    ['verification', 'Verification', 'C02'],
    ['callback', 'Call-back', 'C03'],
    ['cbs', 'Eazybankz', 'C04'],
    ['voucher', 'Voucher', 'C06'],
    ['ht', 'Head Treasury', 'C07'],
    ['mis', 'MIS', 'C08'],
    ['audit', 'Audit', 'C09'],
    ['md', 'MD', 'C10'],
    ['ops', 'Operations', 'C11'],
    ['confirmed', 'Confirmed', 'C12'],
  ];
  let currentSet = false;
  const closed = ['COMPLETED', 'CANCELLED', 'REJECTED', 'STOPPED'].includes(t.status);
  return defs.map(([key, label, code]) => {
    const c = ctl(code);
    let state: StageState;
    if (key === 'confirmed' && t.status === 'COMPLETED') state = 'done';
    else if (c.state === 'PASSED') state = 'done';
    else if (c.state === 'FAILED') state = 'failed';
    else if (!currentSet && !closed) {
      state = 'current';
      currentSet = true;
    } else state = 'todo';
    if (key === 'ops' && t.status === 'EXEC_FAILED') state = 'failed';
    const at = key === 'confirmed' ? t.completedAt : c.actedAt;
    return {
      key,
      label,
      state,
      at: state === 'done' || state === 'failed' ? at : null,
      by: state === 'done' || state === 'failed' ? userName(db, c.actedBy) : null,
    };
  });
}

export function actionsFor(db: Db, t: TreasuryTxn, u: AppUser | null): TxnActions {
  const no = (why: string) => why;
  if (!u) {
    const x = no('Sign in first');
    return {
      continueDraft: x,
      cancel: x,
      stop: x,
      approve: x,
      execute: x,
      confirm: x,
      reverse: x,
      logCallback: x,
    };
  }
  const editable = wf.EDITABLE_STATUSES.includes(t.status);
  const isMaker = t.makerId === u.id;
  const makerOnly = (ok: boolean, stateWhy: string) =>
    u.roleCode !== 'TO'
      ? 'Only a Treasury Officer can do this'
      : !isMaker
        ? 'Only the maker can do this'
        : ok
          ? null
          : stateWhy;
  const c = (code: ControlCode) =>
    db.controls.find((x) => x.txnId === t.id && x.controlCode === code)?.state;
  const origin = t.resultInvestmentId
    ? findById(db, 'investments', t.resultInvestmentId)
    : undefined;
  const openReversal = db.txns.some(
    (x) => x.reversalOfTxnId === t.id && wf.LOCKING_STATUSES.includes(x.status)
  );
  let callbackWhy: string | null = null;
  if (!['VERIFICATION', 'RETURNED'].includes(t.status))
    callbackWhy = 'Call-backs are logged during verification';
  else if (c('C02') !== 'PASSED') callbackWhy = 'Verify the signature first';
  else if (c('C03') === 'PASSED') callbackWhy = 'Call-back already confirmed';
  else if (u.roleCode === 'AO') {
    const cust = findById(db, 'customers', t.customerId);
    if (cust?.accountOfficerId !== u.id) callbackWhy = 'Not your customer';
  } else callbackWhy = 'The customer call-back is made by the Account Officer';

  return {
    continueDraft: makerOnly(editable, 'Transaction is no longer editable'),
    cancel: makerOnly(
      editable,
      'Only drafts, in-verification and returned transactions can be cancelled'
    ),
    stop: makerOnly(['DRAFT', 'VERIFICATION', 'RETURNED'].includes(t.status), 'Too late to stop'),
    approve: wf.approvalBlocker(db, t, u),
    execute:
      u.roleCode !== 'OPS'
        ? 'Only Operations can execute'
        : !['PENDING_OPERATIONS', 'EXEC_FAILED'].includes(t.status)
          ? 'Not ready for execution'
          : isMaker
            ? 'Maker-checker: you created this transaction'
            : null,
    confirm:
      u.roleCode !== 'TO'
        ? 'Only a Treasury Officer can confirm'
        : t.status !== 'EXECUTED'
          ? 'Not executed yet'
          : null,
    reverse:
      u.roleCode !== 'TO'
        ? 'Only a Treasury Officer can raise a reversal'
        : t.status !== 'COMPLETED'
          ? 'Only completed transactions can be reversed'
          : !origin
            ? 'This transaction did not create an investment'
            : t.reversedByTxnId
              ? 'Already reversed'
              : openReversal
                ? 'A reversal is already in progress'
                : origin.status !== 'ACTIVE'
                  ? 'The investment it created is no longer active'
                  : null,
    logCallback: callbackWhy,
  };
}

function relatedIds(db: Db, t: TreasuryTxn): Set<string> {
  const ids = new Set<string>([t.id]);
  for (const table of [
    'instructions',
    'verifications',
    'callbacks',
    'executions',
    'comments',
    'vouchers',
  ] as const) {
    for (const r of db[table] as { id: string; txnId: string }[])
      if (r.txnId === t.id) ids.add(r.id);
  }
  return ids;
}

export function txnAudit(db: Db, t: TreasuryTxn): NamedAudit[] {
  const ids = relatedIds(db, t);
  return db.audit
    .filter((e) => ids.has(e.entityId) || e.summary.startsWith(`${t.txnRef}:`))
    .sort((a, b) => b.seqNo - a.seqNo)
    .map((e) => ({ ...e, userName: userName(db, e.userId) }));
}

function detail(db: Db, id: string): TxnDetail {
  const t = getById(db, 'txns', id, 'transaction');
  if (!canSeeCustomer(t.customerId))
    throw new AppError('You do not have access to this transaction.', 'FORBIDDEN');
  const u = sessionUser();
  const now = nowIso();
  const editable = wf.EDITABLE_STATUSES.includes(t.status);
  let computation: TxnComputation | null = null;
  if (editable) {
    try {
      computation = wf.computeFor(db, t, todayLagos());
    } catch {
      computation = null;
    }
  }
  const origTxn = findById(db, 'txns', t.reversalOfTxnId);
  const revBy = findById(db, 'txns', t.reversedByTxnId);
  const resInv = findById(db, 'investments', t.resultInvestmentId);
  return {
    txn: t,
    customer: getById(db, 'customers', t.customerId, 'customer'),
    accountOfficerName: userName(
      db,
      getById(db, 'customers', t.customerId, 'customer').accountOfficerId
    ),
    maker: getById(db, 'users', t.makerId, 'user'),
    investment: findById(db, 'investments', t.investmentId) ?? null,
    sourceAccount: findById(db, 'accounts', t.sourceAccountId) ?? null,
    destAccount: findById(db, 'accounts', t.destAccountId) ?? null,
    instruction: db.instructions.find((i) => i.txnId === t.id) ?? null,
    verification: db.verifications.find((v) => v.txnId === t.id) ?? null,
    callbacks: db.callbacks
      .filter((c) => c.txnId === t.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({ ...c, officerName: userName(db, c.officerId) })),
    vouchers: db.vouchers.filter((v) => v.txnId === t.id).sort((a, b) => a.seqNo - b.seqNo),
    approvals: db.approvals
      .filter((a) => a.txnId === t.id)
      .sort((a, b) => a.actedAt.localeCompare(b.actedAt))
      .map((a) => ({ ...a, userName: userName(db, a.userId) })),
    executions: db.executions
      .filter((e) => e.txnId === t.id)
      .sort((a, b) => a.attemptNo - b.attemptNo)
      .map((e) => ({
        ...e,
        executedByName: userName(db, e.executedBy),
        confirmedByName: e.confirmedBy ? userName(db, e.confirmedBy) : null,
      })),
    controls: db.controls
      .filter((c) => c.txnId === t.id)
      .sort((a, b) => a.controlCode.localeCompare(b.controlCode))
      .map((c) => ({
        ...c,
        label: CONTROL_LABELS[c.controlCode],
        actorName: c.actedBy ? userName(db, c.actedBy) : null,
      })),
    comments: db.comments
      .filter((c) => c.txnId === t.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ ...c, userName: userName(db, c.userId), mine: !!u && c.userId === u.id })),
    audit: txnAudit(db, t),
    reversalOf: origTxn ? { id: origTxn.id, txnRef: origTxn.txnRef } : null,
    reversedBy: revBy ? { id: revBy.id, txnRef: revBy.txnRef } : null,
    resultInvestment: resInv
      ? { id: resInv.id, investmentRef: resInv.investmentRef, status: resInv.status }
      : null,
    sla: slaState(t.slaDueAt, now, t.completedAt),
    stages: stagesOf(db, t),
    actions: actionsFor(db, t, u),
    gapsRequired: wf.gapsRequired(db, t),
    computation,
  };
}

// ─── Mock ────────────────────────────────────────────────────────────────────

export const mockTransactionsService: TransactionsService = {
  reversible: (customerId, exceptTxnId) =>
    run(() => {
      const db = getDb();
      return db.txns
        .filter(
          (t) => t.customerId === customerId && t.status === 'COMPLETED' && t.resultInvestmentId
        )
        .map((t) => {
          const inv = findById(db, 'investments', t.resultInvestmentId)!;
          const open = db.txns.some(
            (x) =>
              x.reversalOfTxnId === t.id &&
              x.id !== exceptTxnId &&
              wf.LOCKING_STATUSES.includes(x.status)
          );
          return {
            id: t.id,
            txnRef: t.txnRef,
            scenarioCode: t.scenarioCode,
            completedAt: t.completedAt,
            investmentRef: inv.investmentRef,
            principalAmt: inv.principalAmt,
            intRate: inv.intRate,
            tenorDays: inv.tenorDays,
            disabledReason: reversalIneligibility(t, inv, open),
          };
        })
        .sort((a, b) => Number(!!a.disabledReason) - Number(!!b.disabledReason));
    }),
  list: (q = {}) =>
    run(() => {
      const db = getDb();
      const rows = filterTxns(db, q.filters ?? {}, nowIso());
      return paginate(rows, { sort: { field: 'createdAt', dir: 'desc' }, ...q });
    }),

  statusCounts: (filters = {}) =>
    run(() => {
      const db = getDb();
      const rows = filterTxns(db, { ...filters, status: undefined }, nowIso());
      const out = Object.fromEntries(TXN_STATUSES.map((s) => [s, 0])) as Record<
        TxnStatus | 'ALL',
        number
      >;
      out.ALL = rows.length;
      for (const r of rows) out[r.status] += 1;
      return out;
    }),

  get: (id) => run(() => detail(getDb(), id)),

  preview: (id, input) =>
    runNow(() => {
      const db = getDb();
      const t = getById(db, 'txns', id, 'transaction');
      return wf.computeFor(db, t, todayLagos(), input);
    }),

  create: (args) => run(() => wf.createDraft(ctx(['TO']), args)),
  saveDraft: (id, args, version) => run(() => wf.updateDraft(ctx(['TO']), id, args, version)),
  recordInstruction: (id, data) => run(() => wf.recordInstruction(ctx(['TO']), id, data)),
  verifySignature: (id, checks) => run(() => wf.verifySignature(ctx(['TO']), id, checks)),
  stop: (id, reason) => run(() => wf.stopForSignatureMismatch(ctx(['TO']), id, reason)),
  logCallback: (id, data) => run(() => wf.logCallback(ctx(['AO']), id, data)),

  refreshFromCbs: (id) =>
    run(() => {
      requireUser();
      const db = getDb();
      const t = getById(db, 'txns', id, 'transaction');
      const asOf = todayLagos();
      const lines: CbsSnapshot['lines'] = [];
      const inv = findById(db, 'investments', t.investmentId);
      if (inv) {
        const ai = accruedInterest(inv, asOf, db.settings.values);
        lines.push(
          { label: 'Investment', value: inv.investmentRef, format: 'text' },
          { label: 'Principal', value: inv.principalAmt, format: 'money' },
          { label: 'Accrued interest to today', value: ai.value, format: 'money' },
          { label: 'Interest rate', value: inv.intRate, format: 'rate' },
          { label: 'Effective date', value: inv.effectiveDate, format: 'date' },
          { label: 'Maturity date', value: inv.maturityDate, format: 'date' },
          { label: 'Outstanding balance', value: add(inv.principalAmt, ai.value), format: 'money' },
          {
            label: 'Available amount',
            value:
              inv.status === 'MATURED' || inv.maturityDate <= asOf
                ? add(inv.principalAmt, ai.value)
                : inv.principalAmt,
            format: 'money',
          }
        );
      }
      const src = findById(db, 'accounts', t.sourceAccountId);
      if (src) {
        lines.push(
          { label: `Source account (${src.productCode})`, value: src.accountNo, format: 'text' },
          { label: 'Ledger balance', value: src.ledgerBal, format: 'money' },
          { label: 'Available balance', value: src.availableBal, format: 'money' }
        );
      }
      const pa = db.accounts.find((a) => a.customerId === t.customerId && a.productCode === 'PA');
      if (!src && pa) {
        lines.push(
          { label: 'Personal Account (PA)', value: pa.accountNo, format: 'text' },
          { label: 'PA available balance', value: pa.availableBal, format: 'money' }
        );
      }
      return { syncedAt: nowIso(), lines };
    }, 1000),

  confirmCbs: (id, data) => run(() => wf.confirmCbs(ctx(['TO']), id, data)),
  signAndSubmit: (id, sign, version) => run(() => wf.signAndSubmit(ctx(['TO']), id, sign, version)),
  cancel: (id, reason, version) => run(() => wf.cancel(ctx(['TO']), id, reason, version)),
  confirmCompletion: (id, version) => run(() => wf.confirmCompletion(ctx(['TO']), id, version)),
  raiseReversal: (originalTxnId, input) =>
    run(() => wf.raiseReversal(ctx(['TO']), originalTxnId, input)),
  addComment: (id, body) => run(() => wf.addComment(ctx(), id, body)),
  editComment: (commentId, body, version) =>
    run(() => wf.editComment(ctx(), commentId, body, version)),
  deleteComment: (commentId, version) => run(() => wf.deleteComment(ctx(), commentId, version)),
};

// ─── HTTP ────────────────────────────────────────────────────────────────────

export const httpTransactionsService: TransactionsService = {
  reversible: (customerId, exceptTxnId) =>
    http.get('/transactions/reversible', { customerId, exceptTxnId }),
  list: (q) => http.get('/transactions', q as Record<string, unknown>),
  statusCounts: (filters) =>
    http.get('/transactions/status-counts', filters as Record<string, unknown>),
  get: (id) => http.get(`/transactions/${id}`),
  preview: (id, input) => http.post(`/transactions/${id}/preview`, input),
  create: (args) => http.post('/transactions', args),
  saveDraft: (id, args, version) => http.patch(`/transactions/${id}`, { ...args, version }),
  recordInstruction: (id, data) => http.put(`/transactions/${id}/instruction`, data),
  verifySignature: (id, checks) => http.post(`/transactions/${id}/signature-verification`, checks),
  stop: (id, reason) => http.post(`/transactions/${id}/stop`, { reason }),
  logCallback: (id, data) => http.post(`/transactions/${id}/callbacks`, data),
  refreshFromCbs: (id) => http.get(`/transactions/${id}/cbs-snapshot`),
  confirmCbs: (id, data) => http.post(`/transactions/${id}/cbs-confirmation`, data),
  signAndSubmit: (id, sign, version) =>
    http.post(`/transactions/${id}/submit`, { ...sign, version }),
  cancel: (id, reason, version) => http.post(`/transactions/${id}/cancel`, { reason, version }),
  confirmCompletion: (id, version) => http.post(`/transactions/${id}/confirm`, { version }),
  raiseReversal: (originalTxnId, input) =>
    http.post(`/transactions/${originalTxnId}/reversal`, input ?? {}),
  addComment: (id, body) => http.post(`/transactions/${id}/comments`, { body }),
  editComment: (commentId, body, version) => http.put(`/comments/${commentId}`, { body, version }),
  deleteComment: (commentId, version) => http.del(`/comments/${commentId}`, { version }),
};

export const transactionsService: TransactionsService = USE_MOCK
  ? mockTransactionsService
  : httpTransactionsService;

/** Label for the stage a transaction is waiting on. */
export function waitingOn(status: TxnStatus): string {
  const level = levelForStatus(status);
  return level ? level.label : TXN_STATUS_META[status].label;
}
