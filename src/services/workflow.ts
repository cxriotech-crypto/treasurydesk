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
  CallbackLog,
  ControlCheck,
  Ctx,
  Instruction,
  Investment,
  TreasuryTxn,
  TxnComment,
  TxnInput,
  Voucher,
} from '@/domain/types';
import {
  APPROVAL_LEVELS,
  CONTROL_CODES,
  SCENARIO_META,
  TXN_STATUS_META,
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
import { validateAccountNo } from '@/lib/calc';
import { addDays, isIsoDate, isoDatePart, lagosDateTime, parseIso, yearOf } from '@/lib/dates';
import { formatNaira } from '@/lib/format';
import { add, dec, gt, isValidMoney, isPositive, sub, toMoney, ZERO } from '@/lib/money';
import type { Db } from '@/data/db';
import { writeAudit, notify } from '@/data/audit';
import { AppError, findById, getById, insert, nextCounter, remove, update } from '@/data/repo';
import { getDb, mutate } from '@/data/store';
import { computeTxn, type TxnCalcContext, type TxnComputation } from './voucherBuilder';

export const SYSTEM_USER_ID = 'SYSTEM';

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
  const missing = codes.filter((code) => controlOf(db, txnId, code).state !== 'PASSED');
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
    const t = insert(db, 'txns', {
      txnRef,
      txnType: SCENARIO_META[a.scenarioCode].txnType,
      scenarioCode: a.scenarioCode,
      customerId: a.customerId,
      ...subject,
      reversalOfTxnId: a.reversalOfTxnId ?? null,
      reversedByTxnId: null,
      resultInvestmentId: null,
      status: 'DRAFT',
      wizardStep: 1,
      makerId: u.id,
      receivedAt: null,
      submittedAt: null,
      slaDueAt: null,
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
    });
    for (const code of CONTROL_CODES) {
      insert(db, 'controls', {
        txnId: t.id,
        controlCode: code,
        state: 'PENDING',
        actedBy: null,
        actedAt: null,
        note: null,
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
      patch.wizardStep = Math.max(t.wizardStep, Math.min(6, a.wizardStep));
    const preview = { ...t, ...patch } as TreasuryTxn;
    patch.headlineAmt = safeHeadline(db, preview, today(ctx));
    patchTxn(db, ctx, t, patch, 'UPDATE', 'draft saved');
    return t;
  });
}

export type InstructionData = Omit<Instruction, 'id' | 'version' | 'txnId'>;

export function recordInstruction(ctx: Ctx, txnId: string, data: InstructionData): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId);
    requireMaker(t, u);
    requireStatus(t, EDITABLE_STATUSES);
    const errors: Record<string, string> = {};
    const d: InstructionData = { ...data };
    if (t.scenarioCode === 'THIRD_PARTY_EXT') d.payDestination = 'EXTERNAL';
    if (t.scenarioCode === 'THIRD_PARTY_INT') d.payDestination = 'INTERNAL';
    if (!SCENARIO_META[t.scenarioCode].vouchers.includes('FO')) d.payDestination = 'INTERNAL';
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
    // The customer call-back is the Account Officer's step — tell them it is waiting.
    const customer = getById(db, 'customers', t.customerId, 'customer');
    notify(db, ctx, {
      targetUserId: customer.accountOfficerId,
      title: `Call-back due: ${t.txnRef}`,
      body: `Call ${customer.customerName} on ${customer.regPhone} to confirm the instruction.`,
      link: link(t),
    });
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
    requireStatus(t, ['VERIFICATION', 'RETURNED']);
    requireControls(db, t.id, ['C02']);
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
    if (data.outcome === 'CONFIRMED') {
      setControl(
        db,
        ctx,
        t.id,
        'C03',
        'PASSED',
        `Confirmed by ${officer.fullName} on ${data.callDate} ${data.callTime}`
      );
      patchTxn(
        db,
        ctx,
        t,
        { wizardStep: Math.max(t.wizardStep, 5) },
        'STEP',
        'customer call-back confirmed'
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
  cbsSyncedAt: string;
  fundsReceived?: boolean;
  sourceConfirmed?: boolean;
}

export function confirmCbs(ctx: Ctx, txnId: string, data: CbsConfirmation): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['TO']);
    const t = txnOf(db, txnId);
    requireMaker(t, u);
    requireStatus(t, ['VERIFICATION', 'RETURNED']);
    requireControls(db, t.id, ['C01', 'C02', 'C03']);
    if (t.scenarioCode === 'INFLOW' && (!data.fundsReceived || !data.sourceConfirmed)) {
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
      after,
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
      { wizardStep: Math.max(t.wizardStep, 6) },
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
    requireStatus(t, ['VERIFICATION', 'RETURNED']);
    requireControls(db, t.id, ['C01', 'C02', 'C03', 'C04']);
    checkSignature(u, sign);
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
    if (resubmission) {
      for (const code of ['C06', 'C07', 'C08', 'C09', 'C10'] as ControlCode[])
        setControl(db, ctx, t.id, code, 'PENDING');
    }
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
    insert(db, 'approvals', {
      txnId: t.id,
      cycleNo,
      levelNo: 1,
      roleCode: 'TO',
      userId: u.id,
      action: 'APPROVE',
      comments:
        sign.comments?.trim() || (resubmission ? 'Corrected and resubmitted' : 'Raised and signed'),
      actedAt: ctx.at,
    });
    patchTxn(
      db,
      ctx,
      t,
      {
        status: 'PENDING_HEAD_TREASURY',
        cycleNo,
        submittedAt: ctx.at,
        headlineAmt: comp.headlineAmt,
        wizardStep: 6,
      },
      resubmission ? 'RESUBMIT' : 'SUBMIT',
      `${resubmission ? 'resubmitted' : 'signed and submitted'} with ${issued.map((v) => v.voucherNo).join(', ')}`
    );
    notify(db, ctx, {
      targetRole: 'HT',
      title: `Approval needed: ${t.txnRef}`,
      body: `${scenarioLabel(t.scenarioCode)} · ${formatNaira(t.headlineAmt)} from ${u.fullName}`,
      link: link(t),
    });
    return t;
  });
}

function nextStatusAfter(status: TxnStatus): TxnStatus {
  switch (status) {
    case 'PENDING_HEAD_TREASURY':
      return 'PENDING_MIS';
    case 'PENDING_MIS':
      return 'PENDING_AUDIT';
    case 'PENDING_AUDIT':
      return 'PENDING_MD';
    case 'PENDING_MD':
      return 'PENDING_OPERATIONS';
    default:
      throw new AppError('Not awaiting approval.', 'STATE');
  }
}

/** Why this user cannot act on this approval step (null = can act). Shared with the UI. */
export function approvalBlocker(db: Db, t: TreasuryTxn, u: AppUser): string | null {
  const level = levelForStatus(t.status);
  if (!level) return 'Not awaiting approval';
  if (u.roleCode !== level.roleCode) return `Awaiting ${level.label}`;
  if (t.makerId === u.id) return 'Maker-checker: you created this transaction';
  const signed = db.approvals.some(
    (a) => a.txnId === t.id && a.cycleNo === t.cycleNo && a.userId === u.id
  );
  if (signed) return 'You have already signed this transaction';
  return null;
}

function approvalActor(db: Db, ctx: Ctx, t: TreasuryTxn) {
  const u = actor(db, ctx);
  const blocker = approvalBlocker(db, t, u);
  if (blocker) throw new AppError(blocker, 'FORBIDDEN');
  return { u, level: levelForStatus(t.status)! };
}

export function approve(ctx: Ctx, txnId: string, sign: SignArgs, version?: number): TreasuryTxn {
  return mutate((db) => {
    const t = txnOf(db, txnId, version);
    const { u, level } = approvalActor(db, ctx, t);
    checkSignature(u, sign);
    insert(db, 'approvals', {
      txnId: t.id,
      cycleNo: t.cycleNo,
      levelNo: level.levelNo,
      roleCode: level.roleCode,
      userId: u.id,
      action: 'APPROVE',
      comments: sign.comments?.trim() ?? '',
      actedAt: ctx.at,
    });
    setControl(db, ctx, t.id, level.control as ControlCode, 'PASSED', `Signed by ${u.fullName}`);
    const next = nextStatusAfter(t.status);
    patchTxn(
      db,
      ctx,
      t,
      { status: next },
      'APPROVE',
      `approved at level ${level.levelNo} (${level.label})`
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
        body: 'All five signatures are in. Operations have been notified.',
        link: link(t),
      });
    } else {
      const nextLevel = levelForStatus(next)!;
      notify(db, ctx, {
        targetRole: nextLevel.roleCode,
        title: `Approval needed: ${t.txnRef}`,
        body: `${scenarioLabel(t.scenarioCode)} · ${formatNaira(t.headlineAmt)} approved by ${u.fullName}`,
        link: link(t),
      });
    }
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
    insert(db, 'approvals', {
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
      { status: 'RETURNED', returnComment: comments.trim(), wizardStep: 6 },
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
    insert(db, 'approvals', {
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

export type GapsOutcome = { ok: true; gapsRef: string } | { ok: false; reason: string };

export const GAPS_FAILURE_REASONS = [
  'Beneficiary account name mismatch',
  'Cut-off time passed',
  'Destination bank unavailable',
];

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
  const fo = vs.find((v) => v.voucherType === 'FO');
  const ro = vs.find((v) => v.voucherType === 'RO');
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
      const totalDebit = dec(fo!.netAmt).plus(dec(fo!.feeAmt)).gt(dec(fo!.principalAmt))
        ? add(fo!.netAmt, fo!.feeAmt)
        : fo!.principalAmt;
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

export interface ExecuteArgs {
  cbsPostingRef: string;
  gaps: GapsOutcome | null;
}

/** Operations execute in Eazybankz (and GAPS where money leaves the bank). */
export function execute(ctx: Ctx, txnId: string, a: ExecuteArgs, version?: number): TreasuryTxn {
  return mutate((db) => {
    const u = actor(db, ctx, ['OPS']);
    const t = txnOf(db, txnId, version);
    requireStatus(t, ['PENDING_OPERATIONS', 'EXEC_FAILED']);
    if (t.makerId === u.id)
      throw new AppError('Maker-checker: you created this transaction.', 'FORBIDDEN');
    if (!a.cbsPostingRef.trim()) {
      throw new AppError('Enter the Eazybankz posting reference.', 'VALIDATION', {
        cbsPostingRef: 'Posting reference is required',
      });
    }
    const gapsNeeded = gapsRequired(db, t);
    if (gapsNeeded && !a.gaps) throw new AppError('Send the payment to GAPS first.', 'VALIDATION');
    const attemptNo = db.executions.filter((e) => e.txnId === t.id).length + 1;
    const outcome = gapsNeeded ? a.gaps! : null;

    if (outcome && !outcome.ok) {
      const ex = insert(db, 'executions', {
        txnId: t.id,
        attemptNo,
        cbsPostingRef: a.cbsPostingRef.trim(),
        gapsRef: null,
        status: 'FAILED',
        failureReason: outcome.reason,
        executedBy: u.id,
        executedAt: ctx.at,
        confirmedBy: null,
        confirmedAt: null,
      });
      writeAudit(db, ctx, {
        entity: 'Execution',
        entityId: ex.id,
        action: 'GAPS_FAILED',
        summary: `${t.txnRef}: GAPS submission failed – ${outcome.reason}`,
        after: { attemptNo, failureReason: outcome.reason },
      });
      patchTxn(
        db,
        ctx,
        t,
        { status: 'EXEC_FAILED' },
        'EXEC_FAILED',
        `execution failed (${outcome.reason})`
      );
      notify(db, ctx, {
        targetUserId: t.makerId,
        title: `Execution failed: ${t.txnRef}`,
        body: `GAPS: ${outcome.reason}. Operations will retry.`,
        link: link(t),
      });
      return t;
    }

    const resultInvestmentId = applyEffects(db, ctx, t);
    const ex = insert(db, 'executions', {
      txnId: t.id,
      attemptNo,
      cbsPostingRef: a.cbsPostingRef.trim(),
      gapsRef: outcome && outcome.ok ? outcome.gapsRef : null,
      status: 'SUCCESS',
      failureReason: null,
      executedBy: u.id,
      executedAt: ctx.at,
      confirmedBy: null,
      confirmedAt: null,
    });
    writeAudit(db, ctx, {
      entity: 'Execution',
      entityId: ex.id,
      action: 'EXECUTED',
      summary: `${t.txnRef}: posted in Eazybankz (${ex.cbsPostingRef})${ex.gapsRef ? `, GAPS ${ex.gapsRef}` : ''}`,
      after: { cbsPostingRef: ex.cbsPostingRef, gapsRef: ex.gapsRef },
    });
    setControl(
      db,
      ctx,
      t.id,
      'C11',
      'PASSED',
      `Posting ${ex.cbsPostingRef}${ex.gapsRef ? ` · GAPS ${ex.gapsRef}` : ''}`
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
    actor(db, ctx);
    const t = txnOf(db, txnId);
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
    remove(db, 'comments', c.id, version, 'comment');
    writeAudit(db, ctx, {
      entity: 'TxnComment',
      entityId: c.id,
      action: 'DELETE',
      summary: 'Comment deleted',
      before: { body: c.body },
    });
  });
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
