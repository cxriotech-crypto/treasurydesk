/**
 * Workflow engine. Every state transition lives here — never in components.
 *
 * Each function takes a context { userId, at } so the seed generator can replay history with
 * back-dated timestamps through the same code. Each transition validates role + state +
 * maker-checker, updates records, sets controls, writes audit events and notifies the next role.
 */
import type {
  Account,
  AppUser,
  Approval,
  Attachment,
  AttachmentKind,
  AuditReviewStatus,
  CallbackLog,
  Execution,
  ImportBatch,
  ImportRegister,
  ControlCheck,
  Ctx,
  Instruction,
  Investment,
  RecallDecision,
  RecallRequest,
  TreasuryTxn,
  TxnBatch,
  TxnComment,
  TxnInput,
  Voucher,
} from '@/domain/types';
import {
  type AccountProductCode,
  APPROVAL_LEVELS,
  chainLevels,
  CLOSED_STATUSES,
  CONTROL_CODES,
  CONTROL_LABELS,
  RECALLABLE_STATUSES,
  ROLE_LABELS,
  SCENARIO_META,
  TXN_STATUS_META,
  type AnnivFreq,
  chainPosition,
  levelForRole,
  levelForStatus,
  scenarioLabel,
  type ControlCode,
  type ControlState,
  type RoleCode,
  type ScenarioCode,
  type TxnStatus,
} from '@/domain/codes';
import {
  INTERNAL_BANK_CODE,
  accountIneligibility,
  computeSlaDue,
  investmentIneligibility,
  needsGaps,
  reversalIneligibility,
  signatureMatches,
  slaState,
} from '@/domain/rules';
import type { CalcEnv } from '@/lib/calc';
import { maturityDate, validateAccountNo } from '@/lib/calc';
import { addDays, isIsoDate, isoDatePart, lagosDateTime, parseIso, yearOf } from '@/lib/dates';
import { formatNaira } from '@/lib/format';
import { add, dec, gt, isValidMoney, isPositive, sub, toMoney, ZERO } from '@/lib/money';
import type { Db } from '@/data/db';
import { writeAudit, notify } from '@/data/audit';
import { AppError, findById, getById, insert, nextCounter, remove, update } from '@/data/repo';
import { getDb, mutate } from '@/data/store';
import { computeTxn, type TxnCalcContext, type TxnComputation } from './voucherBuilder';

export const SYSTEM_USER_ID = 'SYSTEM';

/** Subject, instruction, signature, Eazybankz, voucher. The call-back follows submission. */
export const WIZARD_STEPS = 5;

export const EDITABLE_STATUSES: TxnStatus[] = ['DRAFT', 'VERIFICATION', 'RETURNED'];
export const LOCKING_STATUSES: TxnStatus[] = [
  'DRAFT',
  'VERIFICATION',
  'PENDING_HEAD_TREASURY',
  'PENDING_MIS',
  'PENDING_AUDIT',
  'PENDING_MD',
  'PENDING_OPERATIONS',
  'EXEC_FAILED',
  'EXECUTED',
  'RETURNED',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function envOf(db: Db): CalcEnv {
  return { settings: db.settings.values, holidays: db.holidays.map((h) => h.holidayDate) };
}

function actor(db: Db, ctx: Ctx, roles?: RoleCode[]): AppUser {
  const u = findById(db, 'users', ctx.userId);
  if (!u || u.status !== 'ACTIVE')
    throw new AppError('Your user account is not active.', 'FORBIDDEN');
  if (roles && !roles.includes(u.roleCode)) {
    throw new AppError('Your role is not allowed to perform this action.', 'FORBIDDEN');
  }
  return u;
}

function txnOf(db: Db, txnId: string, version?: number): TreasuryTxn {
  const t = getById(db, 'txns', txnId, 'transaction');
  if (version !== undefined && t.version !== version) {
    throw new AppError(
      'This transaction was changed by someone else. Reload and try again.',
      'CONFLICT'
    );
  }
  return t;
}

/** Account Officers work only on their own customers (backend docs/SECURITY.md, finding F15). */
function requireCustomerScope(db: Db, u: AppUser, customerId: string, label = 'transaction') {
  if (u.roleCode !== 'AO') return;
  const c = findById(db, 'customers', customerId);
  if (c?.accountOfficerId !== u.id)
    throw new AppError(`The ${label} could not be found.`, 'NOT_FOUND');
}

function requireStatus(t: TreasuryTxn, allowed: TxnStatus[]) {
  if (!allowed.includes(t.status)) {
    throw new AppError(
      `Not allowed while the transaction is "${TXN_STATUS_META[t.status].label}".`,
      'STATE'
    );
  }
}

function requireMaker(t: TreasuryTxn, u: AppUser) {
  if (t.makerId !== u.id)
    throw new AppError(
      'Only the Treasury Officer who created this transaction can do this.',
      'FORBIDDEN'
    );
}

function controlOf(db: Db, txnId: string, code: ControlCode): ControlCheck {
  const c = db.controls.find((x) => x.txnId === txnId && x.controlCode === code);
  if (!c) throw new AppError(`Control ${code} missing`, 'STATE');
  return c;
}

function setControl(
  db: Db,
  ctx: Ctx,
  txnId: string,
  code: ControlCode,
  state: ControlState,
  note: string | null = null
) {
  const c = controlOf(db, txnId, code);
  const passedOrFailed = state !== 'PENDING';
  update(db, 'controls', c.id, {
    state,
    actedBy: passedOrFailed ? ctx.userId : null,
    actedAt: passedOrFailed ? ctx.at : null,
    note,
  });
}

function requireControls(db: Db, txnId: string, codes: ControlCode[]) {
  const missing = codes.filter(
    (code) => !['PASSED', 'NOT_REQUIRED'].includes(controlOf(db, txnId, code).state)
  );
  if (missing.length) {
    throw new AppError(`Complete these steps first: ${missing.join(', ')}.`, 'STATE');
  }
}

function patchTxn(
  db: Db,
  ctx: Ctx,
  t: TreasuryTxn,
  patch: Partial<TreasuryTxn>,
  action: string,
  summary: string
) {
  const { before, after } = update(
    db,
    'txns',
    t.id,
    { ...patch, updatedAt: ctx.at },
    undefined,
    'transaction'
  );
  delete before.updatedAt;
  delete after.updatedAt;
  writeAudit(db, ctx, {
    entity: 'TreasuryTxn',
    entityId: t.id,
    action,
    summary: `${t.txnRef}: ${summary}`,
    before,
    after,
  });
}

const link = (t: TreasuryTxn) => `/transactions/${t.id}`;
const today = (ctx: Ctx) => isoDatePart(ctx.at);

function customerPa(db: Db, customerId: string): Account | undefined {
  return db.accounts.find(
    (a) => a.customerId === customerId && a.productCode === 'PA' && a.status === 'ACTIVE'
  );
}

function customerSs(db: Db, customerId: string): Account | undefined {
  return db.accounts.find(
    (a) => a.customerId === customerId && a.productCode === 'SS' && a.status === 'ACTIVE'
  );
}

function customerCa(db: Db, customerId: string): Account | undefined {
  return db.accounts.find(
    (a) => a.customerId === customerId && a.productCode === 'CA' && a.status === 'ACTIVE'
  );
}

function accountByNo(db: Db, accountNo: string | null | undefined): Account | undefined {
  if (!accountNo) return undefined;
  return db.accounts.find((a) => a.accountNo === accountNo);
}

function hasOpenTxnForInvestment(db: Db, investmentId: string, exceptTxnId?: string): boolean {
  return db.txns.some(
    (t) =>
      t.investmentId === investmentId && t.id !== exceptTxnId && LOCKING_STATUSES.includes(t.status)
  );
}

/** Assemble the context the voucher builder needs for a transaction. */
export function buildCalcContext(
  db: Db,
  t: Pick<
    TreasuryTxn,
    | 'id'
    | 'scenarioCode'
    | 'input'
    | 'customerId'
    | 'investmentId'
    | 'sourceAccountId'
    | 'reversalOfTxnId'
  >,
  asOf: string
): TxnCalcContext {
  const customer = getById(db, 'customers', t.customerId, 'customer');
  const instruction = db.instructions.find((i) => i.txnId === t.id) ?? null;
  const originalTxn = t.reversalOfTxnId ? findById(db, 'txns', t.reversalOfTxnId) : undefined;
  return {
    txn: { scenarioCode: t.scenarioCode, input: t.input },
    customer,
    investment:
      t.scenarioCode === 'TRANSFER_REVERSAL'
        ? null
        : (findById(db, 'investments', t.investmentId) ?? null),
    sourceAccount: findById(db, 'accounts', t.sourceAccountId) ?? null,
    customerPa: customerPa(db, t.customerId) ?? null,
    customerSs: customerSs(db, t.customerId) ?? null,
    customerCa: customerCa(db, t.customerId) ?? null,
    instruction,
    banks: db.banks,
    originalInvestment: originalTxn
      ? (findById(db, 'investments', originalTxn.resultInvestmentId) ?? null)
      : null,
    internalBenefAccount:
      t.scenarioCode === 'THIRD_PARTY_INT' && instruction?.accountNo
        ? (accountByNo(db, instruction.accountNo) ?? null)
        : null,
    today: asOf,
  };
}

export function computeFor(
  db: Db,
  t: TreasuryTxn,
  asOf: string,
  inputOverride?: TxnInput
): TxnComputation {
  const ctx = buildCalcContext(db, inputOverride ? { ...t, input: inputOverride } : t, asOf);
  return computeTxn(ctx, envOf(db));
}

function safeHeadline(db: Db, t: TreasuryTxn, asOf: string): string {
  try {
    return computeFor(db, t, asOf).headlineAmt;
  } catch {
    return t.headlineAmt;
  }
}

// ─── Draft & verification ────────────────────────────────────────────────────

export interface CreateDraftArgs {
  scenarioCode: ScenarioCode;
  customerId: string;
  investmentId?: string | null;
  sourceAccountId?: string | null;
  reversalOfTxnId?: string | null;
  input?: TxnInput;
}

function validateSubject(
  db: Db,
  ctx: Ctx,
  a: CreateDraftArgs,
  exceptTxnId?: string
): { investmentId: string | null; sourceAccountId: string | null; destAccountId: string | null } {
  const meta = SCENARIO_META[a.scenarioCode];
  const customer = getById(db, 'customers', a.customerId, 'customer');
  if (customer.status !== 'ACTIVE') throw new AppError('Customer is inactive.', 'VALIDATION');
  const out = {
    investmentId: null as string | null,
    sourceAccountId: null as string | null,
    destAccountId: null as string | null,
  };
  switch (meta.subject) {
    case 'INVESTMENT': {
      const inv = getById(db, 'investments', a.investmentId, 'investment');
      if (inv.customerId !== customer.id)
        throw new AppError('Investment does not belong to this customer.');
      const why = investmentIneligibility(
        a.scenarioCode,
        inv,
        today(ctx),
        hasOpenTxnForInvestment(db, inv.id, exceptTxnId)
      );
      if (why) throw new AppError(why, 'VALIDATION', { investmentId: why });
      out.investmentId = inv.id;
      break;
    }
    case 'ACCOUNT': {
      const acc = getById(db, 'accounts', a.sourceAccountId, 'account');
      if (acc.customerId !== customer.id)
        throw new AppError('Account does not belong to this customer.');
      const why = accountIneligibility(a.scenarioCode, acc);
      if (why) throw new AppError(why, 'VALIDATION', { sourceAccountId: why });
      out.sourceAccountId = acc.id;
      if (a.scenarioCode === 'TRANSFER_SS_PA')
        out.destAccountId = customerPa(db, customer.id)?.id ?? null;
      break;
    }
    case 'TXN': {
      const orig = getById(db, 'txns', a.reversalOfTxnId, 'original transaction');
      if (orig.customerId !== customer.id)
        throw new AppError('Transaction does not belong to this customer.');
      const inv = findById(db, 'investments', orig.resultInvestmentId);
      const openRev = db.txns.some(
        (t) =>
          t.reversalOfTxnId === orig.id &&
          t.id !== exceptTxnId &&
          LOCKING_STATUSES.includes(t.status)
      );
      const why = reversalIneligibility(orig, inv, openRev);
      if (why) throw new AppError(why, 'VALIDATION', { reversalOfTxnId: why });
      out.investmentId = inv!.id;
      break;
    }
    case 'CUSTOMER':
      break;
  }
  return out;
}

export function createDraft(ctx: Ctx, a: CreateDraftArgs): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const subject = validateSubject(db, ctx, a);
    const year = yearOf(today(ctx));
    const txnRef = `TRX-${year}-${String(nextCounter(db, `txnRef:${year}`)).padStart(6, '0')}`;
    // A bank charge (COT) has no customer instruction: it starts at verification and its SLA starts now.
    const noInstruction = SCENARIO_META[a.scenarioCode].instruction === false;
    const env0 = envOf(db);
    const t = insert(db, 'txns', {
      txnRef,
      txnType: SCENARIO_META[a.scenarioCode].txnType,
      scenarioCode: a.scenarioCode,
      customerId: a.customerId,
      ...subject,
      reversalOfTxnId: a.reversalOfTxnId ?? null,
      reversedByTxnId: null,
      resultInvestmentId: null,
      batchId: null,
      status: noInstruction ? 'VERIFICATION' : 'DRAFT',
      wizardStep: noInstruction ? 4 : 1,
      makerId: u.id,
      receivedAt: noInstruction ? ctx.at : null,
      submittedAt: null,
      slaDueAt: noInstruction ? computeSlaDue(ctx.at, env0.settings, env0.holidays) : null,
      completedAt: null,
      cycleNo: 1,
      input: a.input ?? {},
      headlineAmt: ZERO,
      returnComment: null,
      stopReason: null,
      rejectReason: null,
      createdAt: ctx.at,
      updatedAt: ctx.at,
    });
    const inv = findById(db, 'investments', t.investmentId);
    t.headlineAmt = inv ? toMoney(inv.principalAmt) : ZERO;
    t.headlineAmt = safeHeadline(db, t, today(ctx)) || t.headlineAmt;
    insert(db, 'verifications', {
      txnId: t.id,
      sigOk: false,
      mandateOk: false,
      ownershipOk: false,
      completeOk: false,
      cbsConfirmed: false,
      cbsSyncedAt: null,
      fundsReceived: false,
      sourceConfirmed: false,
      verifiedBy: null,
      verifiedAt: null,
      auditVerifiedBy: null,
      auditVerifiedAt: null,
      auditCycleNo: null,
    });
    const skipped = skippedControls(a.scenarioCode);
    for (const code of CONTROL_CODES) {
      const na = skipped.includes(code);
      insert(db, 'controls', {
        txnId: t.id,
        controlCode: code,
        state: na ? 'NOT_REQUIRED' : 'PENDING',
        actedBy: null,
        actedAt: null,
        note: na
          ? ['C01', 'C02'].includes(code)
            ? 'Not required: a bank charge, no customer instruction'
            : 'Not required on this route'
          : null,
      });
    }
    writeAudit(db, ctx, {
      entity: 'TreasuryTxn',
      entityId: t.id,
      action: 'CREATE',
      summary: `${txnRef}: draft created – ${scenarioLabel(a.scenarioCode)}`,
      after: {
        scenarioCode: t.scenarioCode,
        customerId: t.customerId,
        investmentId: t.investmentId,
        sourceAccountId: t.sourceAccountId,
      },
    });
    return t;
  });
}

export interface UpdateDraftArgs {
  input?: TxnInput;
  wizardStep?: number;
  /** Step 1 changes (only while DRAFT). */
  subject?: CreateDraftArgs;
}

export function updateDraft(
  ctx: Ctx,
  txnId: string,
  a: UpdateDraftArgs,
  version?: number
): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId, version);
    requireMaker(t, u);
    requireStatus(t, EDITABLE_STATUSES);
    const patch: Partial<TreasuryTxn> = {};
    if (a.subject) {
      requireStatus(t, ['DRAFT']);
      const subject = validateSubject(db, ctx, a.subject, t.id);
      Object.assign(patch, subject, {
        scenarioCode: a.subject.scenarioCode,
        txnType: SCENARIO_META[a.subject.scenarioCode].txnType,
        customerId: a.subject.customerId,
        reversalOfTxnId: a.subject.reversalOfTxnId ?? null,
      });
    }
    if (a.input) patch.input = { ...a.input };
    if (a.wizardStep !== undefined)
      patch.wizardStep = Math.max(t.wizardStep, Math.min(WIZARD_STEPS, a.wizardStep));
    const preview = { ...t, ...patch } as TreasuryTxn;
    patch.headlineAmt = safeHeadline(db, preview, today(ctx));
    patchTxn(db, ctx, t, patch, 'UPDATE', 'draft saved');
    return t;
  });
}

export type InstructionData = Omit<Instruction, 'id' | 'version' | 'txnId'> & {
  /** The full list of instruction documents after this save (existing ones keep their id). */
  documents?: AttachmentInput[];
};

/** A file to attach: `id` set for one already attached, omitted for a new upload. */
export interface AttachmentInput {
  id?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string | null;
}

export const MAX_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
const ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

function checkAttachments(files: AttachmentInput[], required: boolean): void {
  if (required && !files.length)
    throw new AppError('Attach at least one document.', 'VALIDATION', {
      documents: 'At least one document is required',
    });
  if (files.length > MAX_ATTACHMENTS)
    throw new AppError(`Attach at most ${MAX_ATTACHMENTS} documents.`, 'VALIDATION', {
      documents: `At most ${MAX_ATTACHMENTS} documents`,
    });
  for (const f of files) {
    if (f.id) continue;
    if (!ATTACHMENT_TYPES.includes(f.mimeType))
      throw new AppError(`${f.fileName}: use a PDF, PNG or JPEG.`, 'VALIDATION', {
        documents: 'PDF, PNG or JPEG only',
      });
    if (f.sizeBytes > MAX_ATTACHMENT_BYTES)
      throw new AppError(`${f.fileName} is larger than 1 MB.`, 'VALIDATION', {
        documents: 'Each file must be 1 MB or smaller',
      });
  }
}

function insertAttachment(
  db: Db,
  ctx: Ctx,
  t: TreasuryTxn,
  kind: AttachmentKind,
  f: AttachmentInput,
  approvalId: string | null = null,
  paperSignatureId: string | null = null
) {
  return insert(db, 'attachments', {
    txnId: t.id,
    kind,
    approvalId,
    paperSignatureId,
    fileName: f.fileName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    dataUrl: f.dataUrl,
    uploadedBy: ctx.userId,
    uploadedAt: ctx.at,
    deletedAt: null,
    deletedBy: null,
  });
}

export function recordInstruction(ctx: Ctx, txnId: string, data: InstructionData): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId);
    requireMaker(t, u);
    requireStatus(t, EDITABLE_STATUSES);
    const errors: Record<string, string> = {};
    const { documents, ...rest } = data;
    const d: Omit<Instruction, 'id' | 'version' | 'txnId'> = { ...rest };
    if (documents) checkAttachments(documents, false);
    if (t.scenarioCode === 'THIRD_PARTY_EXT') d.payDestination = 'EXTERNAL';
    if (t.scenarioCode === 'THIRD_PARTY_INT') d.payDestination = 'INTERNAL';
    if (!SCENARIO_META[t.scenarioCode].payout) d.payDestination = 'INTERNAL';
    if (!isIsoDate(d.receivedDate)) errors.receivedDate = 'Date received is required';
    if (!/^\d{2}:\d{2}$/.test(d.receivedTime)) errors.receivedTime = 'Time received is required';
    if (!isValidMoney(d.amount) || !isPositive(d.amount))
      errors.amount = 'Amount must be greater than zero';
    if (!d.purpose?.trim()) errors.purpose = 'Purpose is required';
    const receivedAt =
      !errors.receivedDate && !errors.receivedTime
        ? lagosDateTime(d.receivedDate, d.receivedTime)
        : null;
    if (receivedAt && parseIso(receivedAt) > parseIso(ctx.at))
      errors.receivedTime = 'Instruction cannot be received in the future';
    const external = d.payDestination === 'EXTERNAL';
    const internalTp = t.scenarioCode === 'THIRD_PARTY_INT';
    if (external || internalTp) {
      if (!d.benefName?.trim()) errors.benefName = 'Beneficiary name is required';
      const accErr = validateAccountNo(d.accountNo);
      if (accErr) errors.accountNo = accErr;
      if (!d.accountType) errors.accountType = 'Account type is required';
    }
    if (external) {
      const bank = db.banks.find((b) => b.bankCode === d.bankCode);
      if (!d.bankCode) errors.bankCode = 'Bank is required';
      else if (!bank || !bank.active) errors.bankCode = 'Bank is not active';
    } else if (internalTp) {
      d.bankCode = INTERNAL_BANK_CODE;
      const acc = accountByNo(db, d.accountNo);
      if (!errors.accountNo && !acc)
        errors.accountNo = 'No internal account found with this number';
      if (acc && acc.id === t.sourceAccountId)
        errors.accountNo = 'Beneficiary account cannot be the source account';
    } else {
      d.benefName = null;
      d.bankCode = null;
      d.accountNo = null;
      d.accountType = null;
    }
    if (Object.keys(errors).length)
      throw new AppError('Please correct the highlighted fields.', 'VALIDATION', errors);

    const existing = db.instructions.find((i) => i.txnId === t.id);
    if (existing) {
      const { before, after } = update(db, 'instructions', existing.id, d);
      writeAudit(db, ctx, {
        entity: 'Instruction',
        entityId: existing.id,
        action: 'UPDATE',
        summary: `${t.txnRef}: instruction updated`,
        before,
        after,
      });
    } else {
      const ins = insert(db, 'instructions', { ...d, txnId: t.id });
      writeAudit(db, ctx, {
        entity: 'Instruction',
        entityId: ins.id,
        action: 'CREATE',
        summary: `${t.txnRef}: instruction recorded (${d.channel.toLowerCase()})`,
        after: { ...d },
      });
    }
    if (documents) {
      // Keep the files still listed, drop the ones removed, add the new uploads.
      const keep = new Set(documents.filter((f) => f.id).map((f) => f.id));
      const current = db.attachments.filter((a) => a.txnId === t.id && a.kind === 'INSTRUCTION');
      for (const a of current) if (!keep.has(a.id)) remove(db, 'attachments', a.id);
      const added = documents.filter((f) => !f.id);
      for (const f of added) insertAttachment(db, ctx, t, 'INSTRUCTION', f);
      if (added.length || current.length !== keep.size)
        writeAudit(db, ctx, {
          entity: 'Attachment',
          entityId: t.id,
          action: 'INSTRUCTION_DOCUMENTS',
          summary: `${t.txnRef}: ${documents.length} instruction document(s) on file`,
          after: { files: documents.map((f) => f.fileName) },
        });
    }
    setControl(db, ctx, t.id, 'C01', 'PASSED', `Received ${d.receivedDate} ${d.receivedTime}`);
    const env = envOf(db);
    const patch: Partial<TreasuryTxn> = {
      receivedAt,
      slaDueAt: computeSlaDue(receivedAt!, env.settings, env.holidays),
      wizardStep: Math.max(t.wizardStep, 3),
    };
    if (internalTp) patch.destAccountId = accountByNo(db, d.accountNo)?.id ?? null;
    if (t.status === 'DRAFT') patch.status = 'VERIFICATION';
    patch.headlineAmt = safeHeadline(db, t, today(ctx));
    patchTxn(db, ctx, t, patch, 'INSTRUCTION', 'instruction received – SLA started');
    return t;
  });
}

export interface SignatureChecks {
  sigOk: boolean;
  mandateOk: boolean;
  ownershipOk: boolean;
  completeOk: boolean;
}

export function verifySignature(ctx: Ctx, txnId: string, checks: SignatureChecks): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId);
    requireMaker(t, u);
    requireStatus(t, ['VERIFICATION', 'RETURNED']);
    requireControls(db, t.id, ['C01']);
    if (!checks.sigOk || !checks.mandateOk || !checks.ownershipOk || !checks.completeOk) {
      throw new AppError(
        'Tick all four checks. If the signature differs, stop processing instead.',
        'VALIDATION'
      );
    }
    const v = db.verifications.find((x) => x.txnId === t.id)!;
    const { before, after } = update(db, 'verifications', v.id, {
      ...checks,
      verifiedBy: u.id,
      verifiedAt: ctx.at,
    });
    writeAudit(db, ctx, {
      entity: 'Verification',
      entityId: v.id,
      action: 'SIGNATURE_VERIFIED',
      summary: `${t.txnRef}: signature and mandate verified`,
      before,
      after,
    });
    setControl(
      db,
      ctx,
      t.id,
      'C02',
      'PASSED',
      'Signature, mandate, ownership and completeness verified'
    );
    patchTxn(
      db,
      ctx,
      t,
      { wizardStep: Math.max(t.wizardStep, 4) },
      'STEP',
      'signature step completed'
    );
    return t;
  });
}

/** Signature differs — stop processing (SOP). */
export function stopForSignatureMismatch(ctx: Ctx, txnId: string, reason: string): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId);
    requireMaker(t, u);
    requireStatus(t, ['DRAFT', 'VERIFICATION', 'RETURNED']);
    if (!reason.trim())
      throw new AppError('Give a reason for stopping.', 'VALIDATION', {
        reason: 'Reason is required',
      });
    setControl(db, ctx, t.id, 'C02', 'FAILED', reason.trim());
    patchTxn(
      db,
      ctx,
      t,
      { status: 'STOPPED', stopReason: reason.trim() },
      'STOP',
      `stopped – signature mismatch (${reason.trim()})`
    );
    notify(db, ctx, {
      targetRole: 'HT',
      title: `Processing stopped: ${t.txnRef}`,
      body: `Signature mismatch reported by ${u.fullName}: ${reason.trim()}`,
      link: link(t),
    });
    return t;
  });
}

export type CallbackData = Omit<
  CallbackLog,
  'id' | 'version' | 'txnId' | 'customerId' | 'createdAt'
>;

export function logCallback(ctx: Ctx, txnId: string, data: CallbackData): CallbackLog {
  return mutate((db) => {
    // SOP step 3: the Account Officer calls the customer on the registered number.
    const u = actor(db, ctx, ['AO']);
    const t = txnOf(db, txnId);
    requireStatus(t, ['PENDING_ACCOUNT_OFFICER']);
    const customer = getById(db, 'customers', t.customerId, 'customer');
    if (customer.accountOfficerId !== u.id) {
      throw new AppError(
        'Account Officers can only log call-backs for their own customers.',
        'FORBIDDEN'
      );
    }
    const officer = findById(db, 'users', data.officerId);
    if (!officer)
      throw new AppError('Officer is required.', 'VALIDATION', {
        officerId: 'Officer is required',
      });
    if (officer.id !== u.id)
      throw new AppError(
        'The call-back is recorded against the officer who made the call.',
        'VALIDATION',
        {
          officerId: 'You can only record a call you made yourself',
        }
      );
    const errors: Record<string, string> = {};
    if (!data.phoneCalled.trim()) errors.phoneCalled = 'Phone number is required';
    if (!isIsoDate(data.callDate)) errors.callDate = 'Date is required';
    if (!/^\d{2}:\d{2}$/.test(data.callTime)) errors.callTime = 'Time is required';
    const allOk = data.amountOk && data.instrOk && data.benefOk && data.purposeOk;
    if (data.outcome === 'CONFIRMED' && !allOk) {
      errors.outcome = 'Outcome cannot be Confirmed unless all four items are confirmed';
    }
    if (data.outcome !== 'CONFIRMED' && !data.notes.trim())
      errors.notes = 'Add a note explaining the outcome';
    if (Object.keys(errors).length)
      throw new AppError('Please correct the highlighted fields.', 'VALIDATION', errors);
    const log = insert(db, 'callbacks', {
      ...data,
      txnId: t.id,
      customerId: t.customerId,
      createdAt: ctx.at,
    });
    writeAudit(db, ctx, {
      entity: 'CallbackLog',
      entityId: log.id,
      action: 'CREATE',
      summary: `${t.txnRef}: call-back to ${data.phoneCalled} – ${data.outcome.toLowerCase()}`,
      after: { ...data },
    });
    // The control passes when the Account Officer approves; the call itself is what they check.
    if (data.outcome === 'CONFIRMED') {
      setControl(
        db,
        ctx,
        t.id,
        'C03',
        'PENDING',
        `Customer confirmed on ${data.callDate} ${data.callTime}; awaiting ${officer.fullName}'s approval`
      );
    } else {
      setControl(
        db,
        ctx,
        t.id,
        'C03',
        'PENDING',
        `Last call ${data.outcome.toLowerCase()}: ${data.notes.trim()}`
      );
    }
    if (u.id !== t.makerId) {
      notify(db, ctx, {
        targetUserId: t.makerId,
        title: `Call-back ${data.outcome.toLowerCase()}: ${t.txnRef}`,
        body: `${u.fullName} called ${customer.customerName}.`,
        link: link(t),
      });
    }
    return log;
  });
}

export interface CbsConfirmation {
  /** When Eazybankz was read — supplied by the service from the core-banking port, never by the browser. */
  cbsSyncedAt: string;
  fundsReceived?: boolean;
  sourceConfirmed?: boolean;
  /** The Eazybankz figures the maker confirmed, recorded in the audit trail. */
  evidence?: Record<string, string>;
}

export function confirmCbs(ctx: Ctx, txnId: string, data: CbsConfirmation): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId);
    requireMaker(t, u);
    requireStatus(t, ['VERIFICATION', 'RETURNED']);
    // C03 (customer call-back) is recorded but does not block: see CHANGES.md.
    requireControls(db, t.id, ['C01', 'C02']);
    if (
      SCENARIO_META[t.scenarioCode].txnType === 'INFLOW' &&
      (!data.fundsReceived || !data.sourceConfirmed)
    ) {
      throw new AppError(
        'Confirm that funds were received and the source account is confirmed.',
        'VALIDATION'
      );
    }
    const v = db.verifications.find((x) => x.txnId === t.id)!;
    const { before, after } = update(db, 'verifications', v.id, {
      cbsConfirmed: true,
      cbsSyncedAt: data.cbsSyncedAt,
      fundsReceived: !!data.fundsReceived,
      sourceConfirmed: !!data.sourceConfirmed,
    });
    writeAudit(db, ctx, {
      entity: 'Verification',
      entityId: v.id,
      action: 'CBS_CONFIRMED',
      summary: `${t.txnRef}: confirmed in Eazybankz`,
      before,
      after: data.evidence ? { ...after, eazybankz: data.evidence } : after,
    });
    setControl(
      db,
      ctx,
      t.id,
      'C04',
      'PASSED',
      `Eazybankz synced ${data.cbsSyncedAt.slice(11, 19)}`
    );
    patchTxn(
      db,
      ctx,
      t,
      { wizardStep: Math.max(t.wizardStep, WIZARD_STEPS) },
      'STEP',
      'Eazybankz verification completed'
    );
    return t;
  });
}

// ─── Submission & approvals ──────────────────────────────────────────────────

export interface SignArgs {
  signatureName: string;
  pin: string;
  comments?: string;
}

function checkSignature(u: AppUser, s: SignArgs) {
  const err = signatureMatches(u, s.signatureName, s.pin);
  if (err) throw new AppError(err, 'VALIDATION', { signature: err });
}

function voucherNo(db: Db, type: Voucher['voucherType'], year: number): string {
  return `${type}-${year}-${String(nextCounter(db, `voucher:${type}:${year}`)).padStart(5, '0')}`;
}

type NewApproval = Omit<Approval, 'id' | 'version' | 'channel' | 'recordedBy' | 'superseded'> &
  Partial<Pick<Approval, 'channel' | 'recordedBy'>>;

function addApproval(db: Db, a: NewApproval): Approval {
  return insert(db, 'approvals', {
    channel: 'APP',
    recordedBy: null,
    superseded: false,
    ...a,
  });
}

/** Signatures that still count in the current cycle. */
function liveApprovals(db: Db, t: TreasuryTxn): Approval[] {
  return db.approvals.filter((a) => a.txnId === t.id && a.cycleNo === t.cycleNo && !a.superseded);
}

/** Approval controls, cleared when a transaction starts the chain again. */
const CHAIN_CONTROLS: ControlCode[] = ['C03', 'C06', 'C07', 'C08', 'C09', 'C10'];

/**
 * The controls this scenario leaves out: approval levels not on its route, and — for a bank charge with no customer
 * instruction (COT) — the instruction and signature checks.
 */
export function skippedControls(s: ScenarioCode): ControlCode[] {
  const levels = chainLevels(s);
  const skipped = APPROVAL_LEVELS.filter((l) => !levels.includes(l.levelNo)).map(
    (l) => l.control as ControlCode
  );
  return SCENARIO_META[s].instruction === false
    ? (['C01', 'C02'] as ControlCode[]).concat(skipped)
    : skipped;
}

/** The status waiting after `levelNo` has signed: the next level on this scenario's route, or Operations. */
function statusAfterLevel(s: ScenarioCode, levelNo: number): TxnStatus {
  const next = chainLevels(s).find((l) => l > levelNo);
  return next ? APPROVAL_LEVELS[next - 1].pendingStatus! : 'PENDING_OPERATIONS';
}

/** Everything signAndSubmit checks before signing, without writing anything. */
export function submitBlocker(db: Db, t: TreasuryTxn, asOf: string): string | null {
  if (!['VERIFICATION', 'RETURNED'].includes(t.status)) return 'Not ready to submit';
  const missing = (['C01', 'C02', 'C04'] as ControlCode[]).filter(
    (c) => !['PASSED', 'NOT_REQUIRED'].includes(controlOf(db, t.id, c).state)
  );
  if (missing.length)
    return `Complete ${missing.map((c) => CONTROL_LABELS[c].toLowerCase()).join(', ')} first`;
  const comp = computeFor(db, t, asOf);
  if (Object.keys(comp.errors).length) return 'The voucher has errors';
  return null;
}

/** The body of a submission; `sign` is checked by the caller. */
function submitOne(
  db: Db,
  ctx: Ctx,
  u: AppUser,
  t: TreasuryTxn,
  sign: SignArgs,
  batchId: string | null
): TreasuryTxn {
  requireMaker(t, u);
  requireStatus(t, ['VERIFICATION', 'RETURNED']);
  requireControls(db, t.id, ['C01', 'C02', 'C04']);
  const comp = computeFor(db, t, today(ctx));
  if (Object.keys(comp.errors).length) {
    throw new AppError(
      'The voucher has errors. Correct them before signing.',
      'VALIDATION',
      comp.errors
    );
  }
  const resubmission = t.status === 'RETURNED';
  const cycleNo = resubmission ? t.cycleNo + 1 : t.cycleNo;
  const first = statusAfterLevel(t.scenarioCode, 1);
  // A resubmission goes through every level again, from the first approver.
  if (resubmission)
    for (const code of CHAIN_CONTROLS)
      if (!skippedControls(t.scenarioCode).includes(code))
        setControl(db, ctx, t.id, code, 'PENDING');
  // Replace vouchers, keeping numbers already issued for the same slot.
  const old = db.vouchers.filter((v) => v.txnId === t.id);
  const year = yearOf(today(ctx));
  for (const v of old) remove(db, 'vouchers', v.id);
  const issued = comp.vouchers.map((draft) => {
    const prev = old.find((o) => o.seqNo === draft.seqNo && o.voucherType === draft.voucherType);
    return insert(db, 'vouchers', {
      ...draft,
      txnId: t.id,
      voucherNo: prev?.voucherNo ?? voucherNo(db, draft.voucherType, year),
      createdAt: ctx.at,
    });
  });
  setControl(db, ctx, t.id, 'C05', 'PASSED', issued.map((v) => v.voucherNo).join(' + '));
  setControl(db, ctx, t.id, 'C06', 'PASSED', `Signed by ${u.fullName}`);
  addApproval(db, {
    txnId: t.id,
    cycleNo,
    levelNo: 1,
    roleCode: 'TO',
    userId: u.id,
    action: 'APPROVE',
    // Only what the maker wrote: an empty note is not a note.
    comments: sign.comments?.trim() ?? '',
    actedAt: ctx.at,
  });
  patchTxn(
    db,
    ctx,
    t,
    {
      status: first,
      cycleNo,
      submittedAt: ctx.at,
      headlineAmt: comp.headlineAmt,
      wizardStep: WIZARD_STEPS,
      returnComment: resubmission ? t.returnComment : null,
      batchId,
    },
    resubmission ? 'RESUBMIT' : 'SUBMIT',
    `${resubmission ? 'resubmitted' : 'signed and submitted'} with ${issued.map((v) => v.voucherNo).join(', ')}`
  );
  const customer = getById(db, 'customers', t.customerId, 'customer');
  if (first === 'PENDING_ACCOUNT_OFFICER')
    notify(db, ctx, {
      targetUserId: customer.accountOfficerId,
      title: `Call and check: ${t.txnRef}`,
      body: `Call ${customer.customerName} on ${customer.regPhone}, then approve, return or reject. ${scenarioLabel(t.scenarioCode)} · ${formatNaira(t.headlineAmt)}`,
      link: link(t),
    });
  else
    notify(db, ctx, {
      targetRole: levelForStatus(first)!.roleCode,
      title: `Approval needed: ${t.txnRef}`,
      body: `${scenarioLabel(t.scenarioCode)} · ${formatNaira(t.headlineAmt)} submitted by ${u.fullName}`,
      link: link(t),
    });
  return getById(db, 'txns', t.id, 'transaction');
}

export function signAndSubmit(
  ctx: Ctx,
  txnId: string,
  sign: SignArgs,
  version?: number
): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId, version);
    requireMaker(t, u);
    checkSignature(u, sign);
    return submitOne(db, ctx, u, t, sign, null);
  });
}

function nextStatusAfter(t: TreasuryTxn): TxnStatus {
  const level = levelForStatus(t.status);
  if (!level) throw new AppError('Not awaiting approval.', 'STATE');
  return statusAfterLevel(t.scenarioCode, level.levelNo);
}

/** Why this user cannot act on this approval step (null = can act). Shared with the UI. */
export function approvalBlocker(db: Db, t: TreasuryTxn, u: AppUser): string | null {
  const level = levelForStatus(t.status);
  if (!level) return 'Not awaiting approval';
  if (u.roleCode !== level.roleCode) return `Awaiting ${level.label}`;
  if (t.makerId === u.id) return 'Maker-checker: you created this transaction';
  if (level.roleCode === 'AO') {
    const c = findById(db, 'customers', t.customerId);
    if (c?.accountOfficerId !== u.id) return "Awaiting the customer's own Account Officer";
  }
  if (liveApprovals(db, t).some((a) => a.userId === u.id && a.action === 'APPROVE'))
    return 'You have already signed this transaction';
  return null;
}

/** The latest call-back logged since this cycle was submitted. */
export function currentCall(db: Db, t: TreasuryTxn): CallbackLog | undefined {
  return db.callbacks
    .filter((c) => c.txnId === t.id && (!t.submittedAt || c.createdAt >= t.submittedAt))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

/** Audit has verified the signature in this cycle. */
export function auditVerified(db: Db, t: TreasuryTxn): boolean {
  const v = db.verifications.find((x) => x.txnId === t.id);
  return !!v?.auditVerifiedBy && v.auditCycleNo === t.cycleNo;
}

/** What still has to happen before this level can approve (null = ready). */
export function approveRequirement(db: Db, t: TreasuryTxn): string | null {
  const level = levelForStatus(t.status);
  if (level?.roleCode === 'AO' && currentCall(db, t)?.outcome !== 'CONFIRMED')
    return 'Log a confirmed call with the customer first';
  if (level?.roleCode === 'AUD' && !auditVerified(db, t)) return 'Verify the signature first';
  return null;
}

function approvalActor(db: Db, ctx: Ctx, t: TreasuryTxn) {
  const u = actor(db, ctx);
  const blocker = approvalBlocker(db, t, u);
  if (blocker) throw new AppError(blocker, 'FORBIDDEN');
  return { u, level: levelForStatus(t.status)! };
}

/** Record one level's signature and move the transaction to the next. */
function advance(
  db: Db,
  ctx: Ctx,
  t: TreasuryTxn,
  signer: AppUser,
  level: (typeof APPROVAL_LEVELS)[number],
  comments: string,
  paper: { recordedBy: AppUser } | null
): Approval {
  const ap = addApproval(db, {
    txnId: t.id,
    cycleNo: t.cycleNo,
    levelNo: level.levelNo,
    roleCode: level.roleCode,
    userId: signer.id,
    action: 'APPROVE',
    comments,
    actedAt: ctx.at,
    channel: paper ? 'PAPER' : 'APP',
    recordedBy: paper?.recordedBy.id ?? null,
  });
  const how = paper
    ? `Signed on paper by ${signer.fullName} (uploaded by ${paper.recordedBy.fullName})`
    : `Signed by ${signer.fullName}`;
  const call = currentCall(db, t);
  const note =
    level.roleCode === 'AO' && call && !paper
      ? `Customer confirmed on ${call.callDate} ${call.callTime}; ${how.toLowerCase()}`
      : how;
  setControl(db, ctx, t.id, level.control as ControlCode, 'PASSED', note);
  const next = nextStatusAfter(t);
  patchTxn(
    db,
    ctx,
    t,
    { status: next },
    paper ? 'APPROVE_PAPER' : 'APPROVE',
    `approved at level ${level.levelNo} (${level.label})${paper ? ' on paper' : ''}`
  );
  if (next === 'PENDING_OPERATIONS') {
    notify(db, ctx, {
      targetRole: 'OPS',
      title: `Ready to execute: ${t.txnRef}`,
      body: `${scenarioLabel(t.scenarioCode)} · ${formatNaira(t.headlineAmt)} fully approved`,
      link: link(t),
    });
    notify(db, ctx, {
      targetUserId: t.makerId,
      title: `Fully approved: ${t.txnRef}`,
      body: 'Every signature is in. Operations have been notified.',
      link: link(t),
    });
  } else {
    const nextLevel = levelForStatus(next)!;
    const c = comments.trim();
    notify(db, ctx, {
      targetRole: nextLevel.roleCode,
      title: `Approval needed: ${t.txnRef}`,
      body: c
        ? `${scenarioLabel(t.scenarioCode)} · ${formatNaira(t.headlineAmt)}. ${signer.fullName}, ${level.label}: ${c}`
        : `${scenarioLabel(t.scenarioCode)} · ${formatNaira(t.headlineAmt)} approved by ${signer.fullName}`,
      link: link(t),
    });
  }
  return ap;
}

export function approve(ctx: Ctx, txnId: string, sign: SignArgs, version?: number): TreasuryTxn {
  return mutate((db) => {
    const t = txnOf(db, txnId, version);
    const { u, level } = approvalActor(db, ctx, t);
    const need = approveRequirement(db, t);
    if (need) throw new AppError(`${need}.`, 'STATE');
    checkSignature(u, sign);
    advance(db, ctx, t, u, level, sign.comments?.trim() ?? '', null);
    return t;
  });
}

export function returnToMaker(
  ctx: Ctx,
  txnId: string,
  comments: string,
  version?: number
): TreasuryTxn {
  return mutate((db) => {
    const t = txnOf(db, txnId, version);
    const { u, level } = approvalActor(db, ctx, t);
    if (!comments.trim())
      throw new AppError('A comment is required when returning.', 'VALIDATION', {
        comments: 'Comment is required',
      });
    addApproval(db, {
      txnId: t.id,
      cycleNo: t.cycleNo,
      levelNo: level.levelNo,
      roleCode: level.roleCode,
      userId: u.id,
      action: 'RETURN',
      comments: comments.trim(),
      actedAt: ctx.at,
    });
    setControl(
      db,
      ctx,
      t.id,
      level.control as ControlCode,
      'PENDING',
      `Returned by ${u.fullName}: ${comments.trim()}`
    );
    patchTxn(
      db,
      ctx,
      t,
      { status: 'RETURNED', returnComment: comments.trim(), wizardStep: WIZARD_STEPS },
      'RETURN',
      `returned to maker by ${level.label}`
    );
    notify(db, ctx, {
      targetUserId: t.makerId,
      title: `Returned for correction: ${t.txnRef}`,
      body: `${u.fullName}: ${comments.trim()}`,
      link: link(t),
    });
    return t;
  });
}

export function reject(ctx: Ctx, txnId: string, reason: string, version?: number): TreasuryTxn {
  return mutate((db) => {
    const t = txnOf(db, txnId, version);
    const { u, level } = approvalActor(db, ctx, t);
    if (!reason.trim())
      throw new AppError('A reason is required when rejecting.', 'VALIDATION', {
        reason: 'Reason is required',
      });
    addApproval(db, {
      txnId: t.id,
      cycleNo: t.cycleNo,
      levelNo: level.levelNo,
      roleCode: level.roleCode,
      userId: u.id,
      action: 'REJECT',
      comments: reason.trim(),
      actedAt: ctx.at,
    });
    setControl(
      db,
      ctx,
      t.id,
      level.control as ControlCode,
      'FAILED',
      `Rejected by ${u.fullName}: ${reason.trim()}`
    );
    patchTxn(
      db,
      ctx,
      t,
      { status: 'REJECTED', rejectReason: reason.trim() },
      'REJECT',
      `rejected by ${level.label}`
    );
    notify(db, ctx, {
      targetUserId: t.makerId,
      title: `Rejected: ${t.txnRef}`,
      body: `${u.fullName}: ${reason.trim()}`,
      link: link(t),
    });
    return t;
  });
}

// ─── Internal Audit's own signature check ────────────────────────────────────

/** Audit re-verifies signature and mandate against the instruction before signing. */
export function auditVerify(ctx: Ctx, txnId: string, checks: SignatureChecks): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['AUD']);
    const t = txnOf(db, txnId);
    requireStatus(t, ['PENDING_AUDIT']);
    if (!checks.sigOk || !checks.mandateOk || !checks.ownershipOk || !checks.completeOk)
      throw new AppError(
        'Tick all four checks. If something differs, return or reject the transaction instead.',
        'VALIDATION'
      );
    const v = db.verifications.find((x) => x.txnId === t.id)!;
    const { before, after } = update(db, 'verifications', v.id, {
      auditVerifiedBy: u.id,
      auditVerifiedAt: ctx.at,
      auditCycleNo: t.cycleNo,
    });
    writeAudit(db, ctx, {
      entity: 'Verification',
      entityId: v.id,
      action: 'AUDIT_SIGNATURE_VERIFIED',
      summary: `${t.txnRef}: signature and mandate re-verified by Internal Audit`,
      before,
      after,
    });
    return t;
  });
}

// ─── Paper signatures ────────────────────────────────────────────────────────

export interface PaperApprovalArgs {
  /** The approver who signed the printed voucher. */
  signedBy: string;
  reason: string;
  documents: AttachmentInput[];
}

/** Paper signatures in this user's name that they have not yet confirmed or disputed. */
export function openPaperSignatures(db: Db, t: TreasuryTxn, u: AppUser) {
  return db.paperSignatures.filter(
    (p) => p.txnId === t.id && p.signedBy === u.id && p.status === 'RECORDED'
  );
}

/**
 * An approver who cannot use TreasuryDesk signs the printed voucher by hand; the maker uploads the scan and that
 * step is complete, in the approver's name. The approver is told and can confirm it, or dispute it if they did not
 * sign — a dispute sends the transaction back to them if it has not been paid yet.
 */
export function recordPaperApproval(
  ctx: Ctx,
  txnId: string,
  a: PaperApprovalArgs,
  version?: number
): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId, version);
    requireMaker(t, u);
    const level = levelForStatus(t.status);
    if (!level) throw new AppError('Not awaiting an approval.', 'STATE');
    const errors: Record<string, string> = {};
    const signer = findById(db, 'users', a.signedBy);
    if (!signer || signer.status !== 'ACTIVE' || signer.roleCode !== level.roleCode)
      errors.signedBy = `Choose the ${level.label} who signed`;
    if (!a.reason.trim()) errors.reason = 'Say why it was signed on paper';
    if (Object.keys(errors).length)
      throw new AppError('Please correct the highlighted fields.', 'VALIDATION', errors);
    checkAttachments(a.documents, true);
    const blocker = approvalBlocker(db, t, signer!);
    if (blocker) throw new AppError(`${signer!.fullName}: ${blocker}`, 'FORBIDDEN');
    const ap = advance(db, ctx, t, signer!, level, a.reason.trim(), { recordedBy: u });
    const p = insert(db, 'paperSignatures', {
      txnId: t.id,
      cycleNo: t.cycleNo,
      levelNo: level.levelNo,
      roleCode: level.roleCode,
      signedBy: signer!.id,
      recordedBy: u.id,
      recordedAt: ctx.at,
      reason: a.reason.trim(),
      status: 'RECORDED',
      decidedAt: null,
      disputeReason: null,
      approvalId: ap.id,
    });
    for (const f of a.documents) insertAttachment(db, ctx, t, 'PAPER_SIGNATURE', f, ap.id, p.id);
    // A paper signature stands for the checks that level would have made in the app.
    if (level.roleCode === 'AUD') {
      const v = db.verifications.find((x) => x.txnId === t.id)!;
      update(db, 'verifications', v.id, {
        auditVerifiedBy: signer!.id,
        auditVerifiedAt: ctx.at,
        auditCycleNo: t.cycleNo,
      });
    }
    writeAudit(db, ctx, {
      entity: 'Approval',
      entityId: ap.id,
      action: 'PAPER_SIGNATURE',
      summary: `${t.txnRef}: ${level.label} signed on paper by ${signer!.fullName}, uploaded by ${u.fullName} (${a.documents.length} file(s))`,
      after: { signedBy: signer!.fullName, reason: p.reason, paperSignatureId: p.id },
    });
    notify(db, ctx, {
      targetUserId: signer!.id,
      title: `Signed on paper in your name: ${t.txnRef}`,
      body: `${u.fullName} uploaded a voucher signed by you on paper and the step is complete. Confirm it, or dispute it if you did not sign.`,
      link: link(t),
    });
    return t;
  });
}

function namedPaperSignature(db: Db, ctx: Ctx, paperId: string) {
  const u = actor(db, ctx);
  const p = getById(db, 'paperSignatures', paperId, 'paper signature');
  if (p.signedBy !== u.id)
    throw new AppError('Only the person named on the paper signature can answer it.', 'FORBIDDEN');
  if (p.status !== 'RECORDED')
    throw new AppError('This paper signature has already been answered.', 'STATE');
  return { u, p, t: txnOf(db, p.txnId) };
}

/** The named approver confirms the signature on paper is theirs. */
export function confirmPaperSignature(ctx: Ctx, paperId: string): TreasuryTxn {
  return mutate((db) => {
    const { u, p, t } = namedPaperSignature(db, ctx, paperId);
    const { before, after } = update(db, 'paperSignatures', p.id, {
      status: 'CONFIRMED',
      decidedAt: ctx.at,
    });
    writeAudit(db, ctx, {
      entity: 'PaperSignature',
      entityId: p.id,
      action: 'PAPER_SIGNATURE_CONFIRMED',
      summary: `${t.txnRef}: ${u.fullName} confirmed the paper signature uploaded in their name`,
      before,
      after,
    });
    return t;
  });
}

/**
 * The named approver says they did not sign. Their signature stops counting. If the transaction has not been paid,
 * it comes back to them (and every later level signs again); either way Audit, Head of Treasury and the MD are
 * alerted and the scan is kept.
 */
export function disputePaperSignature(ctx: Ctx, paperId: string, reason: string): TreasuryTxn {
  return mutate((db) => {
    const { u, p, t } = namedPaperSignature(db, ctx, paperId);
    if (!reason.trim())
      throw new AppError('Say what is wrong with it.', 'VALIDATION', {
        reason: 'Reason is required',
      });
    const { before, after } = update(db, 'paperSignatures', p.id, {
      status: 'DISPUTED',
      decidedAt: ctx.at,
      disputeReason: reason.trim(),
    });
    const ap = p.approvalId ? findById(db, 'approvals', p.approvalId) : undefined;
    const live = !!ap && !ap.superseded && p.cycleNo === t.cycleNo;
    const backToSigner = live && chainPosition(t.status) > p.levelNo && !recallBlocker(db, t);
    const sentTo = backToSigner
      ? sendBackToLevel(db, ctx, t, p.levelNo, 'Paper signature disputed')
      : null;
    if (!backToSigner && ap && !ap.superseded) update(db, 'approvals', ap.id, { superseded: true });
    const maker = findById(db, 'users', p.recordedBy);
    writeAudit(db, ctx, {
      entity: 'PaperSignature',
      entityId: p.id,
      action: 'PAPER_SIGNATURE_DISPUTED',
      summary: `${t.txnRef}: ${u.fullName} disputes the paper signature uploaded in their name by ${maker?.fullName ?? p.recordedBy} – ${reason.trim()}${backToSigner ? '; sent back to them' : ''}`,
      before,
      after,
    });
    if (sentTo)
      patchTxn(
        db,
        ctx,
        t,
        { status: sentTo },
        'PAPER_DISPUTED',
        `paper signature disputed by ${u.fullName}; back with them to decide`
      );
    const body = `${u.fullName} says they did not sign the paper voucher uploaded by ${maker?.fullName ?? 'the maker'}: ${reason.trim()}${backToSigner ? ` It is back with ${u.fullName}.` : ''}`;
    for (const role of ['AUD', 'HT', 'MD'] as RoleCode[])
      notify(db, ctx, {
        targetRole: role,
        title: `Disputed paper signature: ${t.txnRef}`,
        body,
        link: link(t),
      });
    notify(db, ctx, {
      targetUserId: p.recordedBy,
      title: `Paper signature disputed: ${t.txnRef}`,
      body,
      link: link(t),
    });
    return t;
  });
}

// ─── Recall ──────────────────────────────────────────────────────────────────

/** Bring the transaction back to the maker, editable; resubmission starts the chain again. */
function recallToMaker(db: Db, ctx: Ctx, t: TreasuryTxn, by: AppUser, reason: string) {
  // Recorded at the maker's own level: a recall is the maker acting, not a signature.
  addApproval(db, {
    txnId: t.id,
    cycleNo: t.cycleNo,
    levelNo: 1,
    roleCode: 'TO',
    userId: by.id,
    action: 'RECALL',
    comments: reason,
    actedAt: ctx.at,
  });
  cancelPreparedPosting(db, t, 'Recalled');
  const holder = TXN_STATUS_META[t.status].owner[0];
  patchTxn(
    db,
    ctx,
    t,
    {
      status: 'RETURNED',
      returnComment: `Recalled by ${by.fullName}: ${reason}`,
      wizardStep: WIZARD_STEPS,
    },
    'RECALL',
    `recalled by the maker (${reason})`
  );
  if (holder)
    notify(db, ctx, {
      targetRole: holder,
      title: `Recalled: ${t.txnRef}`,
      body: `${by.fullName} recalled it: ${reason}`,
      link: link(t),
    });
}

function cancelPreparedPosting(db: Db, t: TreasuryTxn, why: string) {
  const prepared = db.executions.find((e) => e.txnId === t.id && e.status === 'PREPARED');
  if (prepared) update(db, 'executions', prepared.id, { status: 'RETURNED', returnReason: why });
}

/**
 * Money that Operations have recorded as paid has left the bank: the transaction can no longer be recalled. If the
 * record is wrong, the approving Operations officer sends it back instead.
 */
export function recallBlocker(db: Db, t: TreasuryTxn): string | null {
  if (!RECALLABLE_STATUSES.includes(t.status))
    return 'Only submitted transactions not yet executed can be recalled';
  if (preparedPosting(db, t.id)?.outcome === 'SUCCESS')
    return 'Operations have recorded this as paid — it can no longer be recalled';
  return null;
}

function requireRecallable(db: Db, t: TreasuryTxn) {
  const why = recallBlocker(db, t);
  if (why) throw new AppError(`${why}.`, 'STATE');
}

/** The maker recalls their own transaction at any point before it is executed. */
export function recall(ctx: Ctx, txnId: string, reason: string, version?: number): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId, version);
    requireMaker(t, u);
    requireRecallable(db, t);
    if (!reason.trim())
      throw new AppError('Give a reason for the recall.', 'VALIDATION', {
        reason: 'Reason is required',
      });
    recallToMaker(db, ctx, t, u, reason.trim());
    // Anyone who had asked for a recall has their request answered by this one.
    for (const r of db.recalls.filter((x) => x.txnId === t.id && x.status === 'PENDING'))
      update(db, 'recalls', r.id, {
        status: 'ACCEPTED',
        decision: 'TO_MAKER',
        decidedBy: u.id,
        decidedAt: ctx.at,
        decisionNote: 'Recalled by the maker',
      });
    return t;
  });
}

/** Anyone other than the maker asks the maker to recall it. */
export function requestRecall(ctx: Ctx, txnId: string, reason: string): RecallRequest {
  return mutate((db) => {
    const u = actor(db, ctx, ['AO', 'HT', 'MIS', 'AUD', 'MD', 'OPS']);
    const t = txnOf(db, txnId);
    if (t.makerId === u.id)
      throw new AppError('You created this transaction — recall it yourself.', 'STATE');
    requireRecallable(db, t);
    if (!reason.trim())
      throw new AppError('Say why it should be recalled.', 'VALIDATION', {
        reason: 'Reason is required',
      });
    if (
      db.recalls.some((r) => r.txnId === t.id && r.requestedBy === u.id && r.status === 'PENDING')
    )
      throw new AppError('You have already asked for this to be recalled.', 'STATE');
    const r = insert(db, 'recalls', {
      txnId: t.id,
      requestedBy: u.id,
      reason: reason.trim(),
      requestedAt: ctx.at,
      status: 'PENDING',
      decision: null,
      decidedBy: null,
      decidedAt: null,
      decisionNote: '',
    });
    writeAudit(db, ctx, {
      entity: 'RecallRequest',
      entityId: r.id,
      action: 'CREATE',
      summary: `${t.txnRef}: recall requested by ${u.fullName} – ${reason.trim()}`,
      after: { reason: reason.trim() },
    });
    notify(db, ctx, {
      targetUserId: t.makerId,
      title: `Recall requested: ${t.txnRef}`,
      body: `${u.fullName} (${ROLE_LABELS[u.roleCode]}): ${reason.trim()}`,
      link: link(t),
    });
    return r;
  });
}

/**
 * Signatures from `target` on no longer count and those levels sign again; any payment record awaiting approval is
 * cancelled. Returns the status waiting at that level for the caller to set. 7 = Operations.
 */
function sendBackToLevel(db: Db, ctx: Ctx, t: TreasuryTxn, target: number, why: string): TxnStatus {
  for (const a of liveApprovals(db, t).filter(
    (x) => x.levelNo >= target && x.action === 'APPROVE'
  )) {
    update(db, 'approvals', a.id, { superseded: true });
    const lvl = APPROVAL_LEVELS[a.levelNo - 1];
    if (lvl) setControl(db, ctx, t.id, lvl.control as ControlCode, 'PENDING', why);
  }
  cancelPreparedPosting(db, t, why);
  return target === 7 ? 'PENDING_OPERATIONS' : APPROVAL_LEVELS[target - 1].pendingStatus!;
}

/** Whether a request can be answered by sending it back to the person who asked. */
export function recallToRequesterBlocker(
  db: Db,
  t: TreasuryTxn,
  requester: AppUser
): string | null {
  const target =
    requester.roleCode === 'OPS' ? 7 : (levelForRole(requester.roleCode)?.levelNo ?? 0);
  if (!target) return 'This person has no step in the approval chain';
  if (target > chainPosition(t.status)) return `It has not reached ${requester.fullName} yet`;
  return null;
}

/**
 * The maker answers a recall request: bring it back to themselves (editable, restarts the chain),
 * send it back to the person who asked so they can decide again, or decline.
 */
export function decideRecall(
  ctx: Ctx,
  requestId: string,
  decision: RecallDecision | 'DECLINE',
  note: string
): RecallRequest {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const r = getById(db, 'recalls', requestId, 'recall request');
    const t = txnOf(db, r.txnId);
    requireMaker(t, u);
    if (r.status !== 'PENDING')
      throw new AppError('This request has already been answered.', 'STATE');
    const requester = getById(db, 'users', r.requestedBy, 'user');
    if (decision === 'DECLINE') {
      if (!note.trim())
        throw new AppError('Say why you are declining.', 'VALIDATION', {
          note: 'Reason is required',
        });
    } else {
      requireRecallable(db, t);
    }
    if (decision === 'TO_MAKER') {
      recallToMaker(db, ctx, t, u, `at ${requester.fullName}'s request – ${r.reason}`);
    } else if (decision === 'TO_REQUESTER') {
      const blocker = recallToRequesterBlocker(db, t, requester);
      if (blocker) throw new AppError(blocker, 'STATE');
      const target = requester.roleCode === 'OPS' ? 7 : levelForRole(requester.roleCode)!.levelNo;
      const status = sendBackToLevel(db, ctx, t, target, 'Sent back');
      patchTxn(
        db,
        ctx,
        t,
        { status },
        'RECALL_TO_REQUESTER',
        `sent back to ${requester.fullName} at their request (${r.reason})`
      );
      notify(db, ctx, {
        targetUserId: requester.id,
        title: `Sent back to you: ${t.txnRef}`,
        body: `${u.fullName} accepted your recall request. It is waiting for you again.`,
        link: link(t),
      });
    }
    const { before, after } = update(db, 'recalls', r.id, {
      status: decision === 'DECLINE' ? 'DECLINED' : 'ACCEPTED',
      decision: decision === 'DECLINE' ? null : decision,
      decidedBy: u.id,
      decidedAt: ctx.at,
      decisionNote: note.trim(),
    });
    writeAudit(db, ctx, {
      entity: 'RecallRequest',
      entityId: r.id,
      action: decision === 'DECLINE' ? 'DECLINE' : 'ACCEPT',
      summary: `${t.txnRef}: recall request from ${requester.fullName} ${decision === 'DECLINE' ? 'declined' : decision === 'TO_MAKER' ? 'accepted – back to the maker' : 'accepted – back to the requester'}`,
      before,
      after,
    });
    if (decision === 'DECLINE')
      notify(db, ctx, {
        targetUserId: requester.id,
        title: `Recall declined: ${t.txnRef}`,
        body: `${u.fullName}: ${note.trim()}`,
        link: link(t),
      });
    return getById(db, 'recalls', r.id, 'recall request');
  });
}

// ─── Batches ─────────────────────────────────────────────────────────────────

export interface BatchSubmitResult {
  batch: TxnBatch | null;
  submitted: string[];
  failed: { id: string; txnRef: string; reason: string }[];
}

/** Submit several ready transactions together with one signature. */
export function submitBatch(
  ctx: Ctx,
  txnIds: string[],
  sign: SignArgs,
  note = ''
): BatchSubmitResult {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    if (txnIds.length < 2)
      throw new AppError('Choose at least two transactions for a batch.', 'VALIDATION');
    checkSignature(u, sign);
    const year = yearOf(today(ctx));
    const batch = insert(db, 'batches', {
      batchRef: `BAT-${year}-${String(nextCounter(db, `batch:${year}`)).padStart(4, '0')}`,
      makerId: u.id,
      txnIds: [],
      note: note.trim(),
      createdAt: ctx.at,
    });
    const out: BatchSubmitResult = { batch: null, submitted: [], failed: [] };
    for (const id of txnIds) {
      const t = findById(db, 'txns', id);
      if (!t) continue;
      try {
        submitOne(db, ctx, u, t, sign, batch.id);
        out.submitted.push(id);
      } catch (e) {
        out.failed.push({ id, txnRef: t.txnRef, reason: (e as Error).message });
      }
    }
    if (!out.submitted.length) {
      remove(db, 'batches', batch.id);
      throw new AppError(
        `None of the transactions could be submitted: ${out.failed.map((f) => `${f.txnRef} – ${f.reason}`).join('; ')}`,
        'VALIDATION'
      );
    }
    update(db, 'batches', batch.id, { txnIds: out.submitted });
    writeAudit(db, ctx, {
      entity: 'TxnBatch',
      entityId: batch.id,
      action: 'SUBMIT',
      summary: `${batch.batchRef}: ${out.submitted.length} transaction(s) submitted together`,
      after: { txnIds: out.submitted, failed: out.failed.length },
    });
    out.batch = getById(db, 'batches', batch.id, 'batch');
    return out;
  });
}

export type BatchAction = 'APPROVE' | 'RETURN' | 'REJECT';
export interface BatchItemDecision {
  txnId: string;
  action: BatchAction;
  comment?: string;
}
export interface BatchDecisionResult {
  done: { id: string; txnRef: string; action: BatchAction }[];
  failed: { id: string; txnRef: string; reason: string }[];
}

/**
 * One approver decides on several items of a batch with one signature: approved items move on,
 * returned or rejected ones go back to the maker. Each item is decided on its own, so one failure
 * does not hold up the rest.
 */
export function decideBatch(
  ctx: Ctx,
  batchId: string,
  decisions: BatchItemDecision[],
  sign: SignArgs
): BatchDecisionResult {
  const db0 = getDb();
  const batch = getById(db0, 'batches', batchId, 'batch');
  const u = actor(db0, ctx);
  if (!decisions.length) throw new AppError('Choose at least one item.', 'VALIDATION');
  checkSignature(u, sign);
  for (const d of decisions)
    if (d.action !== 'APPROVE' && !d.comment?.trim())
      throw new AppError('Give a reason for every item you return or reject.', 'VALIDATION', {
        [d.txnId]: 'Reason is required',
      });
  const out: BatchDecisionResult = { done: [], failed: [] };
  for (const d of decisions) {
    const t = findById(getDb(), 'txns', d.txnId);
    if (!t || !batch.txnIds.includes(d.txnId)) continue;
    try {
      if (d.action === 'APPROVE')
        approve(ctx, d.txnId, { ...sign, comments: d.comment ?? sign.comments });
      else if (d.action === 'RETURN') returnToMaker(ctx, d.txnId, d.comment!);
      else reject(ctx, d.txnId, d.comment!);
      out.done.push({ id: t.id, txnRef: t.txnRef, action: d.action });
    } catch (e) {
      out.failed.push({ id: t.id, txnRef: t.txnRef, reason: (e as Error).message });
    }
  }
  mutate((db) => {
    const count = (a: BatchAction) => out.done.filter((x) => x.action === a).length;
    writeAudit(db, ctx, {
      entity: 'TxnBatch',
      entityId: batch.id,
      action: 'DECIDE',
      summary: `${batch.batchRef}: ${u.fullName} approved ${count('APPROVE')}, returned ${count('RETURN')}, rejected ${count('REJECT')}`,
      after: { done: out.done, failed: out.failed },
    });
  });
  return out;
}

export function cancel(ctx: Ctx, txnId: string, reason: string, version?: number): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId, version);
    requireMaker(t, u);
    requireStatus(t, EDITABLE_STATUSES);
    if (!reason.trim())
      throw new AppError('Give a reason for cancelling.', 'VALIDATION', {
        reason: 'Reason is required',
      });
    patchTxn(
      db,
      ctx,
      t,
      { status: 'CANCELLED', rejectReason: reason.trim() },
      'CANCEL',
      `cancelled by maker (${reason.trim()})`
    );
    return t;
  });
}

// ─── Operations ──────────────────────────────────────────────────────────────

export function gapsRequired(db: Db, t: TreasuryTxn): boolean {
  const ins = db.instructions.find((i) => i.txnId === t.id);
  return needsGaps(t.scenarioCode, ins?.payDestination);
}

function credit(db: Db, acc: Account, amount: string) {
  update(db, 'accounts', acc.id, {
    ledgerBal: add(acc.ledgerBal, amount),
    availableBal: add(acc.availableBal, amount),
  });
}

function debit(db: Db, acc: Account, amount: string, what: string) {
  if (gt(amount, acc.availableBal)) {
    throw new AppError(
      `Insufficient funds in ${acc.accountNo} for ${what}: available ${formatNaira(acc.availableBal)}.`,
      'VALIDATION'
    );
  }
  update(db, 'accounts', acc.id, {
    ledgerBal: sub(acc.ledgerBal, amount),
    availableBal: sub(acc.availableBal, amount),
  });
}

function newInvestment(
  db: Db,
  ctx: Ctx,
  t: TreasuryTxn,
  v: Pick<Voucher, 'effectiveDate' | 'newRate' | 'newTenorDays' | 'newMaturityDate'>,
  principal: string,
  base: {
    productCode: Investment['productCode'];
    annivFreqDays: Investment['annivFreqDays'];
    parentInvestmentId: string | null;
    intPaidToDate?: string;
  }
): Investment {
  const eff = v.effectiveDate!;
  const year = yearOf(eff);
  const ref = `INV-${year}-${String(nextCounter(db, `invRef:${year}`)).padStart(5, '0')}`;
  const pa = customerPa(db, t.customerId);
  const tenor = v.newTenorDays!;
  const nextAnniv = base.annivFreqDays ? addDays(eff, base.annivFreqDays) : null;
  const inv = insert(db, 'investments', {
    investmentRef: ref,
    customerId: t.customerId,
    accountId: pa?.id ?? '',
    productCode: base.productCode,
    principalAmt: toMoney(principal),
    intRate: v.newRate!,
    effectiveDate: eff,
    tenorDays: tenor,
    maturityDate: v.newMaturityDate!,
    annivFreqDays: base.annivFreqDays,
    nextAnnivDate: nextAnniv && nextAnniv < v.newMaturityDate! ? nextAnniv : null,
    intPaidToDate: base.intPaidToDate ?? ZERO,
    status: 'ACTIVE',
    parentInvestmentId: base.parentInvestmentId,
    originTxnId: t.id,
    closedTxnId: null,
    closedDate: null,
    createdAt: ctx.at,
  });
  writeAudit(db, ctx, {
    entity: 'Investment',
    entityId: inv.id,
    action: 'CREATE',
    summary: `${ref} booked from ${t.txnRef}: ${formatNaira(inv.principalAmt)} at ${inv.intRate}% for ${tenor} days`,
    after: {
      principalAmt: inv.principalAmt,
      intRate: inv.intRate,
      effectiveDate: eff,
      maturityDate: inv.maturityDate,
      parentInvestmentId: base.parentInvestmentId,
    },
  });
  return inv;
}

function closeInvestment(
  db: Db,
  ctx: Ctx,
  t: TreasuryTxn,
  inv: Investment,
  status: Investment['status'],
  extra: Partial<Investment> = {}
) {
  const { before, after } = update(db, 'investments', inv.id, {
    status,
    closedTxnId: t.id,
    closedDate: today(ctx),
    ...extra,
  });
  writeAudit(db, ctx, {
    entity: 'Investment',
    entityId: inv.id,
    action: status,
    summary: `${inv.investmentRef} ${status.toLowerCase().replace('_', ' ')} by ${t.txnRef}`,
    before,
    after,
  });
}

/** Pay out an FO voucher: internal destinations are credited; external ones leave via GAPS. */
function settlePayout(db: Db, fo: Voucher | undefined) {
  if (!fo?.payment || !isPositive(fo.netAmt)) return;
  if (fo.payment.bankCode !== INTERNAL_BANK_CODE) return; // external: settled by GAPS
  const acc = accountByNo(db, fo.payment.accountNo);
  if (!acc) throw new AppError(`Internal account ${fo.payment.accountNo} not found.`, 'VALIDATION');
  credit(db, acc, fo.netAmt);
}

/** Business effects of a successful execution (section 8 table). */
function applyEffects(db: Db, ctx: Ctx, t: TreasuryTxn) {
  const vs = db.vouchers.filter((v) => v.txnId === t.id).sort((a, b) => a.seqNo - b.seqNo);
  // A voucher that both pays out and rolls over serves as both parts.
  const fo = vs.find((v) => v.voucherType === 'FO') ?? vs.find((v) => !!v.payment);
  const ro =
    vs.find((v) => v.voucherType === 'RO') ?? vs.find((v) => !!v.newRate && isPositive(v.rollAmt));
  const fi = vs.find((v) => v.voucherType === 'FI');
  const ts = vs.find((v) => v.voucherType === 'TS');
  const inv = findById(db, 'investments', t.investmentId);
  let resultInvestmentId: string | null = null;

  switch (t.scenarioCode) {
    case 'INFLOW': {
      const created = newInvestment(db, ctx, t, fi!, fi!.principalAmt, {
        productCode: t.input.productCode ?? 'TERM',
        annivFreqDays: t.input.annivFreqDays ?? 0,
        parentInvestmentId: null,
      });
      resultInvestmentId = created.id;
      break;
    }
    case 'INFLOW_ACCOUNT': {
      // Personal, Savings and Current accounts are credited here; a Call or other account is posted in
      // Eazybankz by Operations and recorded on the voucher.
      const target = t.input.creditTo;
      const acc =
        target === 'PA'
          ? customerPa(db, t.customerId)
          : target === 'SS'
            ? customerSs(db, t.customerId)
            : target === 'CA'
              ? customerCa(db, t.customerId)
              : undefined;
      if (acc) credit(db, acc, fi!.principalAmt);
      break;
    }
    case 'COT_CMS': {
      // The commission is debited from the Current account; a Call account's is posted in Eazybankz.
      const ct = vs.find((v) => v.voucherType === 'CT')!;
      const acc = getById(db, 'accounts', t.sourceAccountId, 'Current account');
      if (isPositive(ct.cotAmt)) debit(db, acc, ct.cotAmt, 'commission on turnover');
      break;
    }
    case 'COT_CALL':
      break;
    case 'MATURITY':
      settlePayout(db, fo);
      closeInvestment(db, ctx, t, inv!, 'CLOSED', {
        intPaidToDate: add(inv!.intPaidToDate, fo!.interestAmt),
      });
      break;
    case 'PRELIQ_FULL':
      settlePayout(db, fo);
      closeInvestment(db, ctx, t, inv!, 'LIQUIDATED', {
        intPaidToDate: add(inv!.intPaidToDate, fo!.interestAmt),
      });
      break;
    case 'PRELIQ_PARTIAL': {
      settlePayout(db, fo);
      closeInvestment(db, ctx, t, inv!, 'LIQUIDATED');
      const created = newInvestment(db, ctx, t, ro!, ro!.rollAmt, {
        productCode: inv!.productCode,
        annivFreqDays: inv!.annivFreqDays,
        parentInvestmentId: inv!.id,
      });
      resultInvestmentId = created.id;
      break;
    }
    case 'ANNIVERSARY': {
      settlePayout(db, fo);
      const period = t.input.annivPeriod ?? inv!.annivFreqDays;
      const current = inv!.nextAnnivDate ?? addDays(inv!.effectiveDate, period);
      const next = addDays(current, period);
      const { before, after } = update(db, 'investments', inv!.id, {
        intPaidToDate: add(inv!.intPaidToDate, fo!.interestAmt),
        nextAnnivDate: next < inv!.maturityDate ? next : null,
      });
      writeAudit(db, ctx, {
        entity: 'Investment',
        entityId: inv!.id,
        action: 'ANNIVERSARY_PAID',
        summary: `${inv!.investmentRef}: ${period}-day interest paid by ${t.txnRef}`,
        before,
        after,
      });
      break;
    }
    case 'ROLLOVER_A':
    case 'ROLLOVER_B':
    case 'ROLLOVER_C':
    case 'ROLLOVER_D': {
      settlePayout(db, fo);
      closeInvestment(db, ctx, t, inv!, 'ROLLED_OVER', {
        intPaidToDate: add(
          inv!.intPaidToDate,
          t.scenarioCode === 'ROLLOVER_A' ? ro!.interestAmt : (fo?.interestAmt ?? ZERO)
        ),
      });
      const created = newInvestment(db, ctx, t, ro!, ro!.rollAmt, {
        productCode: inv!.productCode,
        annivFreqDays: inv!.annivFreqDays,
        parentInvestmentId: inv!.id,
      });
      resultInvestmentId = created.id;
      break;
    }
    case 'THIRD_PARTY_EXT':
    case 'THIRD_PARTY_INT': {
      const src = getById(db, 'accounts', t.sourceAccountId, 'source account');
      // The amount, or more when the transfer charge is added on top; COT is part of what is debited.
      const withCharges = add(fo!.netAmt, fo!.feeAmt, fo!.cotAmt ?? ZERO);
      const totalDebit = gt(withCharges, fo!.principalAmt) ? withCharges : fo!.principalAmt;
      debit(db, src, totalDebit, 'third-party payment');
      if (t.scenarioCode === 'THIRD_PARTY_INT') settlePayout(db, fo);
      break;
    }
    case 'TRANSFER_SS_PA': {
      const src = getById(db, 'accounts', t.sourceAccountId, 'source account');
      const dst = getById(
        db,
        'accounts',
        t.destAccountId ?? customerPa(db, t.customerId)?.id,
        'destination account'
      );
      debit(db, src, ts!.principalAmt, 'transfer');
      credit(db, dst, ts!.principalAmt);
      break;
    }
    case 'TRANSFER_PA_CP':
    case 'TRANSFER_PA_CALL': {
      const src = getById(db, 'accounts', t.sourceAccountId, 'source account');
      debit(db, src, ts!.principalAmt, 'transfer');
      const created = newInvestment(db, ctx, t, ts!, ts!.principalAmt, {
        productCode: t.scenarioCode === 'TRANSFER_PA_CP' ? 'CP' : 'CALL',
        annivFreqDays: 0,
        parentInvestmentId: null,
      });
      resultInvestmentId = created.id;
      break;
    }
    case 'TRANSFER_REVERSAL': {
      const orig = inv!;
      const pa = customerPa(db, t.customerId);
      if (!pa)
        throw new AppError(
          'Customer has no Personal Account to settle the difference.',
          'VALIDATION'
        );
      const delta = ts!.netAmt;
      if (isPositive(delta)) debit(db, pa, delta, 'reversal difference');
      else if (dec(delta).isNegative()) credit(db, pa, toMoney(dec(delta).negated()));
      closeInvestment(db, ctx, t, orig, 'REVERSED');
      const created = newInvestment(db, ctx, t, ts!, ts!.rollAmt, {
        productCode: orig.productCode,
        annivFreqDays: orig.annivFreqDays,
        parentInvestmentId: orig.id,
        intPaidToDate: orig.intPaidToDate,
      });
      resultInvestmentId = created.id;
      const origTxn = getById(db, 'txns', t.reversalOfTxnId, 'original transaction');
      patchTxn(db, ctx, origTxn, { reversedByTxnId: t.id }, 'REVERSED', `reversed by ${t.txnRef}`);
      break;
    }
  }
  return resultInvestmentId;
}

/** What Operations record after paying in GAPS (or posting in Eazybankz). */
export interface PaymentRecord {
  outcome: 'SUCCESS' | 'FAILED';
  /** Eazybankz posting reference; required when it went through. */
  cbsPostingRef?: string;
  /** GAPS payment reference; required when an external payment went through. */
  gapsRef?: string;
  /** Why it failed; required when it failed. */
  failureReason?: string;
}

function checkPaymentRecord(rec: PaymentRecord, viaGaps: boolean): void {
  const e: Record<string, string> = {};
  if (rec.outcome === 'SUCCESS') {
    if (!rec.cbsPostingRef?.trim()) e.cbsPostingRef = 'Enter the Eazybankz posting reference';
    if (viaGaps && !rec.gapsRef?.trim()) e.gapsRef = 'Enter the GAPS payment reference';
  } else if (rec.outcome === 'FAILED') {
    if (!rec.failureReason?.trim()) e.failureReason = 'Say why it failed';
  } else e.outcome = 'Say whether it went through';
  if (Object.keys(e).length) throw new AppError(Object.values(e)[0], 'VALIDATION', e);
}

/**
 * Operations, step one: after paying in GAPS (or posting in Eazybankz), an officer records what happened — the
 * references, or the failure and its reason. TreasuryDesk never sends or holds money. A second Operations officer
 * must approve the record before it counts.
 */
export function recordExecution(
  ctx: Ctx,
  txnId: string,
  rec: PaymentRecord,
  version?: number
): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['OPS']);
    const t = txnOf(db, txnId, version);
    requireStatus(t, ['PENDING_OPERATIONS', 'EXEC_FAILED']);
    if (t.makerId === u.id)
      throw new AppError('Maker-checker: you created this transaction.', 'FORBIDDEN');
    const viaGaps = gapsRequired(db, t);
    checkPaymentRecord(rec, viaGaps);
    const ok = rec.outcome === 'SUCCESS';
    const attemptNo = db.executions.filter((e) => e.txnId === t.id).length + 1;
    const ex = insert(db, 'executions', {
      txnId: t.id,
      attemptNo,
      cbsPostingRef: rec.cbsPostingRef?.trim() || null,
      gapsRef: (viaGaps && rec.gapsRef?.trim()) || null,
      outcome: rec.outcome,
      status: 'PREPARED',
      failureReason: ok ? null : rec.failureReason!.trim(),
      returnReason: null,
      executedBy: u.id,
      executedAt: ctx.at,
      approvedBy: null,
      approvedAt: null,
      confirmedBy: null,
      confirmedAt: null,
    });
    const what = ok
      ? viaGaps
        ? `paid in GAPS (${ex.gapsRef}), posted ${ex.cbsPostingRef}`
        : `posted in Eazybankz (${ex.cbsPostingRef})`
      : `failed – ${ex.failureReason}`;
    writeAudit(db, ctx, {
      entity: 'Execution',
      entityId: ex.id,
      action: 'RECORD',
      summary: `${t.txnRef}: ${what}; recorded by ${u.fullName}, awaiting a second officer`,
      after: {
        attemptNo,
        outcome: ex.outcome,
        cbsPostingRef: ex.cbsPostingRef,
        gapsRef: ex.gapsRef,
        failureReason: ex.failureReason,
      },
    });
    patchTxn(
      db,
      ctx,
      t,
      { status: 'PENDING_OPS_APPROVAL' },
      'RECORD',
      `payment recorded by ${u.fullName} (${ok ? 'went through' : 'failed'})`
    );
    notify(db, ctx, {
      targetRole: 'OPS',
      title: `Payment record to approve: ${t.txnRef}`,
      body: `${u.fullName} recorded it as ${ok ? 'paid' : `failed (${ex.failureReason})`}. Another Operations officer must approve the record.`,
      link: link(t),
    });
    return t;
  });
}

/** The payment record awaiting a second officer, if any. */
export function preparedPosting(db: Db, txnId: string) {
  return db.executions.find((e) => e.txnId === txnId && e.status === 'PREPARED');
}

/** Why this user cannot approve the payment record (null = can). */
export function opsApprovalBlocker(db: Db, t: TreasuryTxn, u: AppUser): string | null {
  if (t.status !== 'PENDING_OPS_APPROVAL') return 'No payment record is waiting for approval';
  if (u.roleCode !== 'OPS') return 'Only Operations approve a payment record';
  const ex = preparedPosting(db, t.id);
  if (!ex) return 'No payment record is waiting for approval';
  if (ex.executedBy === u.id)
    return 'You recorded this payment — another Operations officer must approve it';
  if (t.makerId === u.id) return 'Maker-checker: you created this transaction';
  return null;
}

/**
 * Operations, step two: a different officer checks the record against GAPS and Eazybankz and approves it. A
 * successful payment executes the transaction; a failed one is logged and goes back for Operations to pay again.
 */
export function approveExecution(ctx: Ctx, txnId: string, version?: number): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['OPS']);
    const t = txnOf(db, txnId, version);
    const blocker = opsApprovalBlocker(db, t, u);
    if (blocker) throw new AppError(blocker, 'FORBIDDEN');
    const ex = preparedPosting(db, t.id)!;
    update(db, 'executions', ex.id, { approvedBy: u.id, approvedAt: ctx.at });
    return finishExecution(db, ctx, t, getById(db, 'executions', ex.id, 'execution'));
  });
}

function finishExecution(db: Db, ctx: Ctx, t: TreasuryTxn, ex: Execution): TreasuryTxn {
  const preparer = findById(db, 'users', ex.executedBy);
  const approver = findById(db, 'users', ex.approvedBy);
  const viaGaps = gapsRequired(db, t);
  if (ex.outcome === 'FAILED') {
    update(db, 'executions', ex.id, { status: 'FAILED' });
    writeAudit(db, ctx, {
      entity: 'Execution',
      entityId: ex.id,
      action: 'EXEC_FAILED',
      summary: `${t.txnRef}: failed ${viaGaps ? 'GAPS payment' : 'posting'} confirmed – ${ex.failureReason} (recorded by ${preparer?.fullName}, approved by ${approver?.fullName})`,
      after: { attemptNo: ex.attemptNo, failureReason: ex.failureReason },
    });
    patchTxn(
      db,
      ctx,
      t,
      { status: 'EXEC_FAILED' },
      'EXEC_FAILED',
      `payment failed (${ex.failureReason})`
    );
    notify(db, ctx, {
      targetUserId: t.makerId,
      title: `Payment failed: ${t.txnRef}`,
      body: `${ex.failureReason}. Operations will pay it again and record the outcome.`,
      link: link(t),
    });
    return t;
  }

  const resultInvestmentId = applyEffects(db, ctx, t);
  update(db, 'executions', ex.id, { status: 'SUCCESS' });
  const refs = `${ex.cbsPostingRef}${ex.gapsRef ? ` · GAPS ${ex.gapsRef}` : ''}`;
  writeAudit(db, ctx, {
    entity: 'Execution',
    entityId: ex.id,
    action: 'EXECUTED',
    summary: `${t.txnRef}: ${viaGaps ? 'GAPS payment' : 'posting'} confirmed (${refs}) – recorded by ${preparer?.fullName}, approved by ${approver?.fullName}`,
    after: { cbsPostingRef: ex.cbsPostingRef, gapsRef: ex.gapsRef, approvedBy: ex.approvedBy },
  });
  setControl(
    db,
    ctx,
    t.id,
    'C11',
    'PASSED',
    `Posting ${refs} · recorded by ${preparer?.fullName}, approved by ${approver?.fullName}`
  );
  patchTxn(
    db,
    ctx,
    t,
    { status: 'EXECUTED', resultInvestmentId: resultInvestmentId ?? t.resultInvestmentId },
    'EXECUTE',
    'executed by Operations'
  );
  notify(db, ctx, {
    targetUserId: t.makerId,
    title: `Executed: ${t.txnRef}`,
    body: 'Confirm completion with the customer to close the transaction.',
    link: link(t),
  });
  return t;
}

/** The second officer sends a payment record back to be corrected. */
export function returnExecution(
  ctx: Ctx,
  txnId: string,
  reason: string,
  version?: number
): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['OPS']);
    const t = txnOf(db, txnId, version);
    const blocker = opsApprovalBlocker(db, t, u);
    if (blocker) throw new AppError(blocker, 'FORBIDDEN');
    if (!reason.trim())
      throw new AppError('Say what needs correcting.', 'VALIDATION', {
        reason: 'Reason is required',
      });
    const ex = preparedPosting(db, t.id)!;
    update(db, 'executions', ex.id, {
      status: 'RETURNED',
      returnReason: reason.trim(),
      approvedBy: u.id,
      approvedAt: ctx.at,
    });
    patchTxn(
      db,
      ctx,
      t,
      { status: 'PENDING_OPERATIONS' },
      'POSTING_RETURNED',
      `payment record sent back by ${u.fullName} (${reason.trim()})`
    );
    notify(db, ctx, {
      targetUserId: ex.executedBy,
      title: `Payment record sent back: ${t.txnRef}`,
      body: `${u.fullName}: ${reason.trim()}`,
      link: link(t),
    });
    return t;
  });
}

export function confirmCompletion(ctx: Ctx, txnId: string, version?: number): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId, version);
    requireStatus(t, ['EXECUTED']);
    const sla = slaState(t.slaDueAt, ctx.at, ctx.at);
    const within = !sla || !sla.breached;
    setControl(
      db,
      ctx,
      t.id,
      'C12',
      within ? 'PASSED' : 'FAILED',
      within ? 'Completed within SLA' : sla!.label
    );
    const ex = db.executions.filter((e) => e.txnId === t.id && e.status === 'SUCCESS').pop();
    if (ex) update(db, 'executions', ex.id, { confirmedBy: u.id, confirmedAt: ctx.at });
    patchTxn(
      db,
      ctx,
      t,
      { status: 'COMPLETED', completedAt: ctx.at },
      'COMPLETE',
      `completion confirmed${within ? '' : ` – SLA ${sla!.label.toLowerCase()}`}`
    );
    if (!within) {
      notify(db, ctx, {
        targetRole: 'HT',
        title: `SLA breached: ${t.txnRef}`,
        body: sla!.label,
        link: link(t),
      });
    }
    return t;
  });
}

/** A reversal is a new draft against a completed transaction that created an investment. */
export function raiseReversal(ctx: Ctx, originalTxnId: string, input: TxnInput = {}): TreasuryTxn {
  const orig = getById(getDb(), 'txns', originalTxnId, 'transaction');
  return createDraft(ctx, {
    scenarioCode: 'TRANSFER_REVERSAL',
    customerId: orig.customerId,
    reversalOfTxnId: orig.id,
    input,
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

export function addComment(ctx: Ctx, txnId: string, body: string): TxnComment {
  return mutate((db) => {
    const u = actor(db, ctx);
    const t = txnOf(db, txnId);
    requireCustomerScope(db, u, t.customerId);
    if (!body.trim())
      throw new AppError('Comment cannot be empty.', 'VALIDATION', {
        body: 'Comment cannot be empty',
      });
    const c = insert(db, 'comments', {
      txnId: t.id,
      userId: ctx.userId,
      body: body.trim(),
      createdAt: ctx.at,
      editedAt: null,
      deletedAt: null,
      deletedBy: null,
    });
    writeAudit(db, ctx, {
      entity: 'TxnComment',
      entityId: c.id,
      action: 'CREATE',
      summary: `${t.txnRef}: comment added`,
      after: { body: c.body },
    });
    return c;
  });
}

export function editComment(
  ctx: Ctx,
  commentId: string,
  body: string,
  version?: number
): TxnComment {
  return mutate((db) => {
    actor(db, ctx);
    const c = getById(db, 'comments', commentId, 'comment');
    if (c.userId !== ctx.userId)
      throw new AppError('You can only edit your own comments.', 'FORBIDDEN');
    if (c.deletedAt) throw new AppError('This comment was deleted.', 'STATE');
    if (!body.trim())
      throw new AppError('Comment cannot be empty.', 'VALIDATION', {
        body: 'Comment cannot be empty',
      });
    const { before, after } = update(
      db,
      'comments',
      c.id,
      { body: body.trim(), editedAt: ctx.at },
      version,
      'comment'
    );
    writeAudit(db, ctx, {
      entity: 'TxnComment',
      entityId: c.id,
      action: 'UPDATE',
      summary: 'Comment edited',
      before,
      after,
    });
    return c;
  });
}

export function deleteComment(ctx: Ctx, commentId: string, version?: number): void {
  mutate((db) => {
    actor(db, ctx);
    const c = getById(db, 'comments', commentId, 'comment');
    if (c.userId !== ctx.userId)
      throw new AppError('You can only delete your own comments.', 'FORBIDDEN');
    if (c.deletedAt) throw new AppError('This comment was already deleted.', 'STATE');
    // Kept, not erased: hidden from the working view, still visible to Internal Audit.
    update(db, 'comments', c.id, { deletedAt: ctx.at, deletedBy: ctx.userId }, version, 'comment');
    writeAudit(db, ctx, {
      entity: 'TxnComment',
      entityId: c.id,
      action: 'DELETE',
      summary: 'Comment deleted (kept for Internal Audit)',
      before: { body: c.body },
    });
  });
}

// ─── Supporting documents ────────────────────────────────────────────────────

/** Anyone working on a transaction can attach supporting documents, several at a time. */
export function addSupportingDocuments(
  ctx: Ctx,
  txnId: string,
  files: AttachmentInput[]
): Attachment[] {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO', 'AO', 'HT', 'MIS', 'AUD', 'MD', 'OPS']);
    const t = txnOf(db, txnId);
    if (u.roleCode === 'AO') {
      const c = findById(db, 'customers', t.customerId);
      if (c?.accountOfficerId !== u.id)
        throw new AppError(
          'Account Officers can only add documents for their own customers.',
          'FORBIDDEN'
        );
    }
    checkAttachments(
      files.map((f) => ({ ...f, id: undefined })),
      true
    );
    const onFile = db.attachments.filter(
      (a) => a.txnId === t.id && a.kind === 'SUPPORTING' && !a.deletedAt
    );
    if (onFile.length + files.length > MAX_ATTACHMENTS * 3)
      throw new AppError('This transaction already has the most documents allowed.', 'VALIDATION');
    const added = files.map((f) =>
      insertAttachment(db, ctx, t, 'SUPPORTING', { ...f, id: undefined })
    );
    writeAudit(db, ctx, {
      entity: 'Attachment',
      entityId: t.id,
      action: 'ADD',
      summary: `${t.txnRef}: ${added.length} supporting document(s) added by ${u.fullName}`,
      after: { files: added.map((a) => a.fileName) },
    });
    return added;
  });
}

/** Whoever uploaded a supporting document can remove it while the transaction is still open. */
export function removeSupportingDocument(ctx: Ctx, attachmentId: string): void {
  mutate((db) => {
    const u = actor(db, ctx);
    const a = getById(db, 'attachments', attachmentId, 'document');
    const t = txnOf(db, a.txnId);
    if (a.kind !== 'SUPPORTING')
      throw new AppError('Only supporting documents can be removed here.', 'STATE');
    if (a.uploadedBy !== u.id)
      throw new AppError('You can only remove documents you uploaded.', 'FORBIDDEN');
    if (CLOSED_STATUSES.includes(t.status))
      throw new AppError('The transaction is closed; its documents are kept.', 'STATE');
    if (a.deletedAt) throw new AppError('This document was already removed.', 'STATE');
    // Kept, not erased: an approver may have relied on it. Hidden from the working view; Internal Audit sees it.
    update(db, 'attachments', a.id, { deletedAt: ctx.at, deletedBy: u.id });
    writeAudit(db, ctx, {
      entity: 'Attachment',
      entityId: a.id,
      action: 'DELETE',
      summary: `${t.txnRef}: supporting document ${a.fileName} removed (kept for Internal Audit)`,
      before: { fileName: a.fileName },
    });
  });
}

// ─── Data import ─────────────────────────────────────────────────────────────

export interface ImportDraft {
  register: ImportRegister;
  fileName: string;
  rows: Record<string, string>[];
  rejectedRows: { line: number; errors: string[] }[];
}

/**
 * Upload a validated file. A Head of Treasury's own upload is applied straight away; a Treasury
 * Officer's waits for a Head of Treasury to approve it.
 */
export function createImport(ctx: Ctx, draft: ImportDraft): ImportBatch {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO', 'HT']);
    if (!draft.rows.length)
      throw new AppError('There are no valid rows to import.', 'VALIDATION', {
        file: 'No valid rows',
      });
    const year = yearOf(today(ctx));
    const batch = insert(db, 'imports', {
      batchRef: `IMP-${year}-${String(nextCounter(db, `import:${year}`)).padStart(4, '0')}`,
      register: draft.register,
      fileName: draft.fileName,
      rows: draft.rows,
      rejectedRows: draft.rejectedRows,
      status: 'PENDING_APPROVAL',
      uploadedBy: u.id,
      uploadedAt: ctx.at,
      decidedBy: null,
      decidedAt: null,
      comments: '',
      createdCount: 0,
      skippedRows: [],
    });
    writeAudit(db, ctx, {
      entity: 'ImportBatch',
      entityId: batch.id,
      action: 'CREATE',
      summary: `${batch.batchRef}: ${draft.rows.length} ${draft.register.toLowerCase()} row(s) uploaded from ${draft.fileName}`,
      after: { register: draft.register, rows: draft.rows.length, fileName: draft.fileName },
    });
    if (u.roleCode === 'HT') return applyImport(db, ctx, batch, u, 'Uploaded and applied');
    notify(db, ctx, {
      targetRole: 'HT',
      title: `Data import to approve: ${batch.batchRef}`,
      body: `${u.fullName} uploaded ${draft.rows.length} ${draft.register.toLowerCase()} row(s).`,
      link: '/imports',
    });
    return batch;
  });
}

/** Approve a pending upload and write its rows, or reject it with a reason. */
export function decideImport(
  ctx: Ctx,
  batchId: string,
  decision: 'APPROVE' | 'REJECT',
  sign: SignArgs,
  version?: number
): ImportBatch {
  return mutate((db) => {
    const u = actor(db, ctx, ['HT']);
    const batch = getById(db, 'imports', batchId, 'import');
    if (version !== undefined && batch.version !== version)
      throw new AppError(
        'This import was changed by someone else. Reload and try again.',
        'CONFLICT'
      );
    if (batch.status !== 'PENDING_APPROVAL')
      throw new AppError('This import has already been decided.', 'STATE');
    if (batch.uploadedBy === u.id)
      throw new AppError('You cannot approve an import you uploaded yourself.', 'FORBIDDEN');
    checkSignature(u, sign);
    if (decision === 'REJECT') {
      const reason = sign.comments?.trim();
      if (!reason)
        throw new AppError('A reason is required when rejecting an import.', 'VALIDATION', {
          comments: 'Give a reason',
        });
      const { before, after } = update(db, 'imports', batch.id, {
        status: 'REJECTED',
        decidedBy: u.id,
        decidedAt: ctx.at,
        comments: reason,
      });
      writeAudit(db, ctx, {
        entity: 'ImportBatch',
        entityId: batch.id,
        action: 'REJECT',
        summary: `${batch.batchRef}: rejected – ${reason}`,
        before,
        after,
      });
      notify(db, ctx, {
        targetUserId: batch.uploadedBy,
        title: `Import rejected: ${batch.batchRef}`,
        body: `${u.fullName}: ${reason}`,
        link: '/imports',
      });
      return getById(db, 'imports', batch.id, 'import');
    }
    return applyImport(db, ctx, batch, u, sign.comments?.trim() ?? '');
  });
}

/** Write the rows of an approved batch into their register. */
function applyImport(
  db: Db,
  ctx: Ctx,
  batch: ImportBatch,
  by: AppUser,
  comments: string
): ImportBatch {
  let created = 0;
  const skippedRows: { row: number; reason: string }[] = [];
  batch.rows.forEach((row, i) => {
    try {
      created += importRow(db, ctx, batch.register, row) ? 1 : 0;
    } catch (e) {
      // A row that no longer fits the data — a missing customer, a duplicate — is left out and
      // the reason is kept, so nothing disappears without an explanation.
      skippedRows.push({ row: i + 1, reason: (e as Error).message });
    }
  });
  const { before, after } = update(db, 'imports', batch.id, {
    status: 'APPLIED',
    decidedBy: by.id,
    decidedAt: ctx.at,
    comments,
    createdCount: created,
    skippedRows,
  });
  writeAudit(db, ctx, {
    entity: 'ImportBatch',
    entityId: batch.id,
    action: 'APPLY',
    summary: `${batch.batchRef}: ${created} ${batch.register.toLowerCase()} record(s) created`,
    before,
    after,
  });
  if (batch.uploadedBy !== by.id)
    notify(db, ctx, {
      targetUserId: batch.uploadedBy,
      title: `Import applied: ${batch.batchRef}`,
      body: `${by.fullName} approved it. ${created} record(s) created.`,
      link: '/imports',
    });
  return getById(db, 'imports', batch.id, 'import');
}

function importRow(db: Db, ctx: Ctx, register: ImportRegister, row: Record<string, string>) {
  const customerOf = (cif: string) => {
    const c = db.customers.find((x) => x.cifNo === cif);
    if (!c) throw new AppError(`No customer with CIF ${cif}`, 'VALIDATION');
    return c;
  };
  switch (register) {
    case 'CUSTOMERS': {
      const officer = db.users.find(
        (u) =>
          u.email.toLowerCase() === row.accountOfficerEmail.toLowerCase() && u.roleCode === 'AO'
      );
      if (!officer) throw new AppError('Unknown Account Officer', 'VALIDATION');
      const cifNo = `FMT${String(nextCounter(db, 'cif')).padStart(6, '0')}`;
      const c = insert(db, 'customers', {
        cifNo,
        customerName: row.customerName,
        customerType: row.customerType === 'CORPORATE' ? 'CORP' : 'IND',
        regPhone: row.regPhone,
        email: row.email,
        address: row.address,
        bvnMasked: row.bvn ? `*******${row.bvn.slice(-4)}` : '',
        whtExempt: row.whtExempt === 'YES',
        accountOfficerId: officer.id,
        status: 'ACTIVE',
        createdAt: ctx.at,
      });
      writeAudit(db, ctx, {
        entity: 'Customer',
        entityId: c.id,
        action: 'IMPORT',
        summary: `${c.cifNo} ${c.customerName} imported`,
        after: { customerName: c.customerName, cifNo: c.cifNo },
      });
      return true;
    }
    case 'ACCOUNTS': {
      const c = customerOf(row.cifNo);
      if (db.accounts.some((a) => a.accountNo === row.accountNo))
        throw new AppError('Account number already exists', 'VALIDATION');
      const a = insert(db, 'accounts', {
        customerId: c.id,
        accountNo: row.accountNo,
        accountName: row.accountName,
        productCode: (['SS', 'CA'].includes(row.productCode.toUpperCase())
          ? row.productCode.toUpperCase()
          : 'PA') as AccountProductCode,
        ledgerBal: row.ledgerBal,
        availableBal: row.availableBal || row.ledgerBal,
        status: 'ACTIVE',
        openedDate: row.openedDate,
      });
      writeAudit(db, ctx, {
        entity: 'Account',
        entityId: a.id,
        action: 'IMPORT',
        summary: `${a.accountNo} imported for ${c.customerName}`,
        after: { accountNo: a.accountNo, ledgerBal: a.ledgerBal },
      });
      return true;
    }
    case 'INVESTMENTS': {
      const c = customerOf(row.cifNo);
      const acc = db.accounts.find((a) => a.accountNo === row.accountNo && a.customerId === c.id);
      if (!acc) throw new AppError('Funding account not found for this customer', 'VALIDATION');
      const tenorDays = Number(row.tenorDays);
      const annivFreqDays = Number(row.annivFreqDays || '0') as AnnivFreq;
      const maturity = maturityDate(
        row.effectiveDate,
        tenorDays,
        db.holidays.map((h) => h.holidayDate),
        db.settings.values.maturityHolidayRule
      );
      const year = yearOf(today(ctx));
      const inv = insert(db, 'investments', {
        investmentRef: `INV-${year}-${String(nextCounter(db, `invRef:${year}`)).padStart(5, '0')}`,
        customerId: c.id,
        accountId: acc.id,
        productCode: (row.productCode as 'TERM' | 'CP' | 'CALL') ?? 'TERM',
        principalAmt: row.principalAmt,
        intRate: row.intRate,
        effectiveDate: row.effectiveDate,
        tenorDays,
        maturityDate: maturity.date,
        annivFreqDays,
        nextAnnivDate: annivFreqDays ? addDays(row.effectiveDate, annivFreqDays) : null,
        intPaidToDate: row.intPaidToDate || ZERO,
        status: maturity.date < today(ctx) ? 'MATURED' : 'ACTIVE',
        parentInvestmentId: null,
        originTxnId: null,
        closedTxnId: null,
        closedDate: null,
        createdAt: ctx.at,
      });
      writeAudit(db, ctx, {
        entity: 'Investment',
        entityId: inv.id,
        action: 'IMPORT',
        summary: `${inv.investmentRef} imported for ${c.customerName}`,
        after: { principalAmt: inv.principalAmt, intRate: inv.intRate, maturity: inv.maturityDate },
      });
      return true;
    }
    case 'BENEFICIARIES': {
      const c = customerOf(row.cifNo);
      const b = insert(db, 'beneficiaries', {
        customerId: c.id,
        benefName: row.benefName,
        bankCode: row.bankCode,
        accountNo: row.accountNo,
        accountType: row.accountType === 'CURRENT' ? 'CURRENT' : 'SAVINGS',
        isInternal: row.bankCode === INTERNAL_BANK_CODE,
        createdAt: ctx.at,
      });
      writeAudit(db, ctx, {
        entity: 'Beneficiary',
        entityId: b.id,
        action: 'IMPORT',
        summary: `${b.benefName} imported for ${c.customerName}`,
        after: { benefName: b.benefName, accountNo: b.accountNo },
      });
      return true;
    }
    case 'BANKS': {
      if (db.banks.some((b) => b.bankCode === row.bankCode))
        throw new AppError('Bank code already exists', 'VALIDATION');
      const b = insert(db, 'banks', {
        bankCode: row.bankCode,
        bankName: row.bankName,
        shortName: row.shortName,
        active: true,
      });
      writeAudit(db, ctx, {
        entity: 'Bank',
        entityId: b.id,
        action: 'IMPORT',
        summary: `${b.bankCode} ${b.bankName} imported`,
        after: { bankCode: b.bankCode, bankName: b.bankName },
      });
      return true;
    }
    case 'HOLIDAYS': {
      if (db.holidays.some((h) => h.holidayDate === row.holidayDate))
        throw new AppError('That date is already a holiday', 'VALIDATION');
      const h = insert(db, 'holidays', {
        holidayDate: row.holidayDate,
        description: row.description,
      });
      writeAudit(db, ctx, {
        entity: 'PublicHoliday',
        entityId: h.id,
        action: 'IMPORT',
        summary: `${h.holidayDate} ${h.description} imported`,
        after: { holidayDate: h.holidayDate },
      });
      return true;
    }
  }
}

// ─── Housekeeping ────────────────────────────────────────────────────────────

/** Active investments past maturity become MATURED (awaiting instruction). */
export function sweepMaturities(ctx: Ctx): number {
  const asOf = today(ctx);
  const due = getDb().investments.filter((i) => i.status === 'ACTIVE' && i.maturityDate < asOf);
  if (!due.length) return 0;
  return mutate((db) => {
    for (const inv of due) {
      const { before, after } = update(db, 'investments', inv.id, { status: 'MATURED' });
      writeAudit(db, ctx, {
        entity: 'Investment',
        entityId: inv.id,
        action: 'MATURED',
        summary: `${inv.investmentRef} matured – awaiting instruction`,
        before,
        after,
      });
    }
    return due.length;
  });
}

export { APPROVAL_LEVELS };

// ─── Audit-trail review ──────────────────────────────────────────────────────

export interface AuditReviewResult {
  done: number[];
  skipped: { seqNo: number; reason: string }[];
}

/** The current review of each audit entry (the newest review row), keyed by event id. */
export function currentAuditReviews(db: Db) {
  const map = new Map<string, Db['auditReviews'][number]>();
  for (const r of db.auditReviews) map.set(r.auditEventId, r);
  return map;
}

/**
 * Internal Audit marks audit-trail entries verified, flags them with a reason, or puts them back to not reviewed.
 * An auditor never reviews their own actions. One audit event records the whole selection.
 */
export function reviewAuditEvents(
  ctx: Ctx,
  eventIds: string[],
  status: AuditReviewStatus,
  note: string
): AuditReviewResult {
  return mutate((db) => {
    const u = actor(db, ctx, ['AUD']);
    if (!eventIds.length) throw new AppError('Select at least one entry.', 'VALIDATION');
    if (status !== 'VERIFIED' && !note.trim())
      throw new AppError(
        status === 'FLAGGED' ? 'Say why you are flagging it.' : 'Say why it is being reopened.',
        'VALIDATION',
        { note: 'Reason is required' }
      );
    const current = currentAuditReviews(db);
    const out: AuditReviewResult = { done: [], skipped: [] };
    for (const id of eventIds) {
      const e = getById(db, 'audit', id, 'audit entry');
      const now = current.get(e.id)?.status ?? 'NOT_REVIEWED';
      if (e.userId === u.id) {
        out.skipped.push({ seqNo: e.seqNo, reason: 'your own action' });
        continue;
      }
      if (now === status) {
        out.skipped.push({
          seqNo: e.seqNo,
          reason: `already ${status === 'NOT_REVIEWED' ? 'not reviewed' : status.toLowerCase()}`,
        });
        continue;
      }
      insert(db, 'auditReviews', {
        auditEventId: e.id,
        auditSeqNo: e.seqNo,
        status,
        note: note.trim(),
        reviewedBy: u.id,
        reviewedAt: ctx.at,
      });
      out.done.push(e.seqNo);
    }
    if (out.done.length) {
      const verb =
        status === 'VERIFIED'
          ? 'marked verified'
          : status === 'FLAGGED'
            ? 'flagged'
            : 'put back to not reviewed';
      const list = out.done
        .slice(0, 12)
        .map((n) => `#${n}`)
        .join(', ');
      writeAudit(db, ctx, {
        entity: 'AuditReview',
        entityId: `AUDIT-${out.done[0]}`,
        action: `REVIEW_${status}`,
        summary: `${u.fullName} ${verb} ${out.done.length} audit entr${out.done.length === 1 ? 'y' : 'ies'} (${list}${out.done.length > 12 ? ', …' : ''})${note.trim() ? `: ${note.trim()}` : ''}`,
        after: { status, seqNos: out.done, note: note.trim() },
      });
      if (status === 'FLAGGED')
        for (const role of ['HT', 'MD'] as RoleCode[])
          notify(db, ctx, {
            targetRole: role,
            title: `Audit flagged ${out.done.length} entr${out.done.length === 1 ? 'y' : 'ies'}`,
            body: `${u.fullName}: ${note.trim()}`,
            link: '/audit?review=FLAGGED',
          });
    }
    return out;
  });
}
