import type {
  Account,
  AppUser,
  Approval,
  Attachment,
  AuditEvent,
  CallbackLog,
  ControlCheck,
  Customer,
  Execution,
  Instruction,
  Investment,
  PaperSignature,
  ListQuery,
  ListResult,
  RecallDecision,
  RecallRequest,
  TreasuryTxn,
  TxnBatch,
  TxnComment,
  TxnInput,
  Verification,
  Voucher,
} from '@/domain/types';
import {
  CONTROL_LABELS,
  ROLE_LABELS,
  TXN_STATUSES,
  TXN_STATUS_META,
  levelForStatus,
  type ControlCode,
  type ScenarioCode,
  type TxnStatus,
  type TxnType,
} from '@/domain/codes';
import { reversalIneligibility, slaState, type SlaState } from '@/domain/rules';
import { isoDatePart, nowIso, todayLagos } from '@/lib/dates';
import { add, gte, lte } from '@/lib/money';
import type { Db } from '@/data/db';
import { getDb } from '@/data/store';
import { AppError, findById, getById, matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run, runNow, sessionUser } from './core';
import { canSeeCustomer, visibleCustomerIds } from './scope';
import * as wf from './workflow';
import { ports, type CbsSnapshotData } from './ports';
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
  batchRef: string | null;
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
  /** Who can act at this approval step (return and reject use this too). */
  approve: string | null;
  /** What must happen before this step can approve: the AO's confirmed call, Audit's check. */
  approveReady: string | null;
  /** Operations, first officer: key the posting. */
  execute: string | null;
  /** Operations, second officer: approve the payment record. */
  opsApprove: string | null;
  confirm: string | null;
  reverse: string | null;
  logCallback: string | null;
  /** Internal Audit re-verifies the signature. */
  auditVerify: string | null;
  /** The maker uploads a paper signature for the level now waiting. */
  paperSign: string | null;
  /** The maker recalls the transaction. */
  recall: string | null;
  /** Anyone else asks the maker to recall it. */
  requestRecall: string | null;
  addDocuments: string | null;
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
  approvedByName: string | null;
  confirmedByName: string | null;
}
export interface NamedAttachment extends Attachment {
  uploadedByName: string;
  mine: boolean;
}
export interface NamedRecall extends RecallRequest {
  requestedByName: string;
  requestedByRole: string;
  decidedByName: string | null;
  /** Why it cannot go back to the person who asked, or null when it can. */
  toRequesterBlocker: string | null;
}
export interface NamedAudit extends AuditEvent {
  userName: string;
}

export interface NamedPaperSignature extends PaperSignature {
  signedByName: string;
  recordedByName: string;
  /** The signed-in user is the approver named on it. */
  mine: boolean;
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
  /** The customer's active Personal, Savings and Current accounts (Inflow B can credit any of them). */
  customerPa: Account | null;
  customerSs: Account | null;
  customerCa: Account | null;
  instruction: Instruction | null;
  verification: Verification | null;
  callbacks: NamedCallback[];
  vouchers: Voucher[];
  approvals: NamedApproval[];
  executions: NamedExecution[];
  controls: NamedControl[];
  comments: NamedComment[];
  attachments: NamedAttachment[];
  recalls: NamedRecall[];
  batch: Pick<TxnBatch, 'id' | 'batchRef'> | null;
  /** Internal Audit has re-verified the signature in this cycle. */
  auditVerified: boolean;
  /** People who can be named on a paper signature for the level now waiting. */
  paperSigners: { id: string; fullName: string }[];
  /** Every paper signature recorded on this transaction, newest first. */
  paperSignatures: NamedPaperSignature[];
  /** Paper signatures in the signed-in user's name that they have not confirmed or disputed yet. */
  myOpenPaper: NamedPaperSignature[];
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

/** What the maker confirms after reading the Eazybankz figures. */
export type CbsAttestation = Omit<wf.CbsConfirmation, 'cbsSyncedAt' | 'evidence'>;

/** Ask Eazybankz (through the core-banking port) for the figures behind a transaction. */
async function cbsSnapshotFor(id: string): Promise<CbsSnapshotData> {
  const req = await run(() => {
    requireUser();
    const db = getDb();
    const t = getById(db, 'txns', id, 'transaction');
    if (!canSeeCustomer(t.customerId))
      throw new AppError('The transaction could not be found.', 'NOT_FOUND');
    const inv = findById(db, 'investments', t.investmentId);
    const src = findById(db, 'accounts', t.sourceAccountId);
    const pa = db.accounts.find((a) => a.customerId === t.customerId && a.productCode === 'PA');
    return {
      investmentRef: inv?.investmentRef ?? null,
      sourceAccountNo: src?.accountNo ?? null,
      paAccountNo: src ? null : (pa?.accountNo ?? null),
      asOf: todayLagos(),
    };
  });
  return ports().coreBanking.snapshot(req);
}

function toSnapshot(d: CbsSnapshotData): CbsSnapshot {
  const lines: CbsSnapshot['lines'] = [];
  if (d.investment) {
    const i = d.investment;
    lines.push(
      { label: 'Investment', value: i.investmentRef, format: 'text' },
      { label: 'Principal', value: i.principalAmt, format: 'money' },
      { label: 'Accrued interest to today', value: i.accruedInterest, format: 'money' },
      { label: 'Interest rate', value: i.intRate, format: 'rate' },
      { label: 'Effective date', value: i.effectiveDate, format: 'date' },
      { label: 'Maturity date', value: i.maturityDate, format: 'date' },
      {
        label: 'Outstanding balance',
        value: add(i.principalAmt, i.accruedInterest),
        format: 'money',
      },
      { label: 'Available amount', value: i.availableAmt, format: 'money' }
    );
  }
  if (d.sourceAccount) {
    lines.push(
      {
        label: `Source account (${d.sourceAccount.productCode})`,
        value: d.sourceAccount.accountNo,
        format: 'text',
      },
      { label: 'Ledger balance', value: d.sourceAccount.ledgerBal, format: 'money' },
      { label: 'Available balance', value: d.sourceAccount.availableBal, format: 'money' }
    );
  }
  if (!d.sourceAccount && d.pa) {
    lines.push(
      { label: 'Personal Account (PA)', value: d.pa.accountNo, format: 'text' },
      { label: 'PA available balance', value: d.pa.availableBal, format: 'money' }
    );
  }
  return { syncedAt: d.syncedAt, lines };
}

/** The figures recorded in the audit trail with the maker's confirmation. */
function snapshotEvidence(d: CbsSnapshotData): Record<string, string> {
  const e: Record<string, string> = { syncedAt: d.syncedAt };
  if (d.investment) {
    e.investmentRef = d.investment.investmentRef;
    e.principalAmt = d.investment.principalAmt;
    e.accruedInterest = d.investment.accruedInterest;
    e.availableAmt = d.investment.availableAmt;
  }
  if (d.sourceAccount) {
    e.sourceAccountNo = d.sourceAccount.accountNo;
    e.sourceAvailableBal = d.sourceAccount.availableBal;
  }
  if (d.pa) {
    e.paAccountNo = d.pa.accountNo;
    e.paAvailableBal = d.pa.availableBal;
  }
  return e;
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
  /** The maker's confirmation; the Eazybankz figures and sync time are fetched by the service itself. */
  confirmCbs(id: string, data: CbsAttestation): Promise<TreasuryTxn>;
  signAndSubmit(id: string, sign: wf.SignArgs, version?: number): Promise<TreasuryTxn>;
  auditVerify(id: string, checks: wf.SignatureChecks): Promise<TreasuryTxn>;
  recordPaperApproval(
    id: string,
    args: wf.PaperApprovalArgs,
    version?: number
  ): Promise<TreasuryTxn>;
  /** The approver named on a paper signature confirms it is theirs. */
  confirmPaperSignature(paperId: string): Promise<TreasuryTxn>;
  /** The approver named on a paper signature says they did not sign it (sent back to them if not yet paid). */
  disputePaperSignature(paperId: string, reason: string): Promise<TreasuryTxn>;
  recall(id: string, reason: string, version?: number): Promise<TreasuryTxn>;
  requestRecall(id: string, reason: string): Promise<RecallRequest>;
  decideRecall(
    requestId: string,
    decision: RecallDecision | 'DECLINE',
    note: string
  ): Promise<RecallRequest>;
  addDocuments(id: string, files: wf.AttachmentInput[]): Promise<Attachment[]>;
  removeDocument(attachmentId: string): Promise<void>;
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
    batchRef: findById(db, 'batches', t.batchId)?.batchRef ?? null,
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
    ['cbs', 'Eazybankz', 'C04'],
    ['voucher', 'Voucher', 'C06'],
    ['callback', 'Account Officer', 'C03'],
    ['ht', 'Head Treasury', 'C07'],
    ['mis', 'MIS', 'C08'],
    ['audit', 'Audit', 'C09'],
    ['md', 'MD', 'C10'],
    ['ops', 'Operations', 'C11'],
    ['confirmed', 'Confirmed', 'C12'],
  ];
  let currentSet = false;
  const closed = ['COMPLETED', 'CANCELLED', 'REJECTED', 'STOPPED'].includes(t.status);
  return defs
    .filter(([, , code]) => ctl(code).state !== 'NOT_REQUIRED')
    .map(([key, label, code]) => {
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
      approveReady: x,
      execute: x,
      opsApprove: x,
      confirm: x,
      reverse: x,
      logCallback: x,
      auditVerify: x,
      paperSign: x,
      recall: x,
      requestRecall: x,
      addDocuments: x,
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
  const origin = t.resultInvestmentId
    ? findById(db, 'investments', t.resultInvestmentId)
    : undefined;
  const openReversal = db.txns.some(
    (x) => x.reversalOfTxnId === t.id && wf.LOCKING_STATUSES.includes(x.status)
  );
  const cust = findById(db, 'customers', t.customerId);
  let callbackWhy: string | null = null;
  if (u.roleCode !== 'AO') callbackWhy = 'The customer call-back is made by the Account Officer';
  else if (cust?.accountOfficerId !== u.id) callbackWhy = 'Not your customer';
  else if (t.status !== 'PENDING_ACCOUNT_OFFICER')
    callbackWhy = 'The call is made once the Treasury Officer has submitted';
  else if (wf.currentCall(db, t)?.outcome === 'CONFIRMED')
    callbackWhy = 'The customer has confirmed — approve when ready';

  const level = levelForStatus(t.status);
  const approveWho = wf.approvalBlocker(db, t, u);
  const recallWhy = wf.recallBlocker(db, t);
  const pendingMine = db.recalls.some(
    (r) => r.txnId === t.id && r.requestedBy === u.id && r.status === 'PENDING'
  );

  return {
    continueDraft: makerOnly(editable, 'Transaction is no longer editable'),
    cancel: makerOnly(
      editable,
      'Only drafts, in-verification and returned transactions can be cancelled'
    ),
    stop: makerOnly(['DRAFT', 'VERIFICATION', 'RETURNED'].includes(t.status), 'Too late to stop'),
    approve: approveWho,
    approveReady: approveWho ? null : wf.approveRequirement(db, t),
    execute:
      u.roleCode !== 'OPS'
        ? 'Only Operations record a payment'
        : !['PENDING_OPERATIONS', 'EXEC_FAILED'].includes(t.status)
          ? 'Not ready for Operations'
          : isMaker
            ? 'Maker-checker: you created this transaction'
            : null,
    opsApprove: wf.opsApprovalBlocker(db, t, u),
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
    auditVerify:
      u.roleCode !== 'AUD'
        ? 'Only Internal Audit re-verifies the signature'
        : t.status !== 'PENDING_AUDIT'
          ? 'Not with Internal Audit'
          : wf.auditVerified(db, t)
            ? 'Already verified in this round'
            : null,
    paperSign: makerOnly(!!level, 'Nothing is waiting for an approver'),
    recall: makerOnly(!recallWhy, recallWhy ?? ''),
    requestRecall: isMaker
      ? 'You created this transaction — recall it yourself'
      : !['AO', 'HT', 'MIS', 'AUD', 'MD', 'OPS'].includes(u.roleCode)
        ? 'Your role cannot request a recall'
        : recallWhy
          ? recallWhy
          : pendingMine
            ? 'You have already asked for a recall'
            : null,
    addDocuments:
      u.roleCode === 'ADM'
        ? 'Administrators do not work on transactions'
        : u.roleCode === 'AO' && cust?.accountOfficerId !== u.id
          ? 'Not your customer'
          : null,
  };
}

function namedPaper(db: Db, p: PaperSignature, u: AppUser | null): NamedPaperSignature {
  return {
    ...p,
    signedByName: userName(db, p.signedBy),
    recordedByName: userName(db, p.recordedBy),
    mine: !!u && p.signedBy === u.id,
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
    'attachments',
    'recalls',
    'paperSignatures',
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
    customerPa:
      db.accounts.find(
        (a) => a.customerId === t.customerId && a.productCode === 'PA' && a.status === 'ACTIVE'
      ) ?? null,
    customerSs:
      db.accounts.find(
        (a) => a.customerId === t.customerId && a.productCode === 'SS' && a.status === 'ACTIVE'
      ) ?? null,
    customerCa:
      db.accounts.find(
        (a) => a.customerId === t.customerId && a.productCode === 'CA' && a.status === 'ACTIVE'
      ) ?? null,
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
        approvedByName: e.approvedBy ? userName(db, e.approvedBy) : null,
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
      // Deleted comments are kept; only Internal Audit still sees them (marked deleted).
      .filter((c) => c.txnId === t.id && (!c.deletedAt || u?.roleCode === 'AUD'))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ ...c, userName: userName(db, c.userId), mine: !!u && c.userId === u.id })),
    attachments: db.attachments
      .filter((a) => a.txnId === t.id && (!a.deletedAt || u?.roleCode === 'AUD'))
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
      .map((a) => ({
        ...a,
        uploadedByName: userName(db, a.uploadedBy),
        mine: !!u && a.uploadedBy === u.id,
      })),
    paperSignatures: db.paperSignatures
      .filter((p) => p.txnId === t.id)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .map((p) => namedPaper(db, p, u)),
    myOpenPaper: u ? wf.openPaperSignatures(db, t, u).map((p) => namedPaper(db, p, u)) : [],
    recalls: db.recalls
      .filter((r) => r.txnId === t.id)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      .map((r) => {
        const who = findById(db, 'users', r.requestedBy);
        return {
          ...r,
          requestedByName: who?.fullName ?? r.requestedBy,
          requestedByRole: who ? ROLE_LABELS[who.roleCode] : '',
          decidedByName: r.decidedBy ? userName(db, r.decidedBy) : null,
          toRequesterBlocker: who ? wf.recallToRequesterBlocker(db, t, who) : 'Unknown user',
        };
      }),
    batch: (() => {
      const b = findById(db, 'batches', t.batchId);
      return b ? { id: b.id, batchRef: b.batchRef } : null;
    })(),
    auditVerified: wf.auditVerified(db, t),
    paperSigners: (() => {
      const lvl = levelForStatus(t.status);
      if (!lvl) return [];
      const owner = findById(db, 'customers', t.customerId)?.accountOfficerId;
      return db.users
        .filter(
          (x) =>
            x.status === 'ACTIVE' &&
            x.roleCode === lvl.roleCode &&
            (lvl.roleCode !== 'AO' || x.id === owner) &&
            !wf.approvalBlocker(db, t, x)
        )
        .map((x) => ({ id: x.id, fullName: x.fullName }));
    })(),
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

  refreshFromCbs: async (id) => toSnapshot(await cbsSnapshotFor(id)),

  // The Eazybankz figures and sync time come from the core banking system, never from the browser.
  confirmCbs: async (id, data) => {
    const snap = await cbsSnapshotFor(id);
    return run(() =>
      wf.confirmCbs(ctx(['TO']), id, {
        ...data,
        cbsSyncedAt: snap.syncedAt,
        evidence: snapshotEvidence(snap),
      })
    );
  },
  signAndSubmit: (id, sign, version) => run(() => wf.signAndSubmit(ctx(['TO']), id, sign, version)),
  auditVerify: (id, checks) => run(() => wf.auditVerify(ctx(['AUD']), id, checks)),
  recordPaperApproval: (id, args, version) =>
    run(() => wf.recordPaperApproval(ctx(['TO']), id, args, version)),
  confirmPaperSignature: (paperId) => run(() => wf.confirmPaperSignature(ctx(), paperId)),
  disputePaperSignature: (paperId, reason) =>
    run(() => wf.disputePaperSignature(ctx(), paperId, reason)),
  recall: (id, reason, version) => run(() => wf.recall(ctx(['TO']), id, reason, version)),
  requestRecall: (id, reason) => run(() => wf.requestRecall(ctx(), id, reason)),
  decideRecall: (requestId, decision, note) =>
    run(() => wf.decideRecall(ctx(['TO']), requestId, decision, note)),
  addDocuments: (id, files) => run(() => wf.addSupportingDocuments(ctx(), id, files)),
  removeDocument: (attachmentId) => run(() => wf.removeSupportingDocument(ctx(), attachmentId)),
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
  auditVerify: (id, checks) => http.post(`/transactions/${id}/audit-verification`, checks),
  recordPaperApproval: (id, args, version) =>
    http.post(`/transactions/${id}/paper-approval`, { ...args, version }),
  confirmPaperSignature: (paperId) => http.post(`/paper-signatures/${paperId}/confirm`),
  disputePaperSignature: (paperId, reason) =>
    http.post(`/paper-signatures/${paperId}/dispute`, { reason }),
  recall: (id, reason, version) => http.post(`/transactions/${id}/recall`, { reason, version }),
  requestRecall: (id, reason) => http.post(`/transactions/${id}/recall-requests`, { reason }),
  decideRecall: (requestId, decision, note) =>
    http.post(`/recall-requests/${requestId}/decision`, { decision, note }),
  addDocuments: (id, files) => http.post(`/transactions/${id}/documents`, { files }),
  removeDocument: (attachmentId) => http.del(`/documents/${attachmentId}`, {}),
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
