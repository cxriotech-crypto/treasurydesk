/**
 * Domain model (Oracle-ready).
 *
 * Field names are camelCase versions of future Oracle columns (principalAmt ↔ PRINCIPAL_AMT).
 * - Every record has `id` and `version` (optimistic concurrency).
 * - Money is a string with 2 dp ("10000000.00"). Rates are strings ("15.00").
 * - Business dates are "YYYY-MM-DD"; timestamps are ISO with +01:00 (Africa/Lagos).
 */

import type {
  AccountProductCode,
  AccountType,
  CreditTarget,
  AnnivFreq,
  ApprovalAction,
  ApprovalChannel,
  CallbackOutcome,
  ControlCode,
  ControlState,
  CustomerType,
  ExecutionStatus,
  InstructionChannel,
  InvestmentStatus,
  MandateRule,
  PayDestination,
  ProductCode,
  RecordStatus,
  RoleCode,
  ScenarioCode,
  SignClass,
  TxnStatus,
  TxnType,
  VoucherRowKind,
  VoucherType,
} from './codes';

export type Money = string;
export type Rate = string;
export type IsoDate = string;
export type IsoDateTime = string;

export interface BaseRecord {
  id: string;
  version: number;
}

export interface AppUser extends BaseRecord {
  fullName: string;
  email: string;
  roleCode: RoleCode;
  staffId: string;
  status: RecordStatus;
  lastLoginAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface Bank extends BaseRecord {
  bankCode: string;
  bankName: string;
  shortName: string;
  active: boolean;
}

export interface Customer extends BaseRecord {
  cifNo: string;
  customerName: string;
  customerType: CustomerType;
  regPhone: string;
  email: string;
  address: string;
  bvnMasked: string;
  whtExempt: boolean;
  accountOfficerId: string;
  status: RecordStatus;
  createdAt: IsoDateTime;
}

export interface Signatory extends BaseRecord {
  customerId: string;
  fullName: string;
  signClass: SignClass;
  specimenSvg: string;
  active: boolean;
}

export interface Mandate extends BaseRecord {
  customerId: string;
  ruleCode: MandateRule;
  effectiveDate: IsoDate;
}

export interface Account extends BaseRecord {
  customerId: string;
  accountNo: string;
  accountName: string;
  productCode: AccountProductCode;
  ledgerBal: Money;
  availableBal: Money;
  status: RecordStatus;
  openedDate: IsoDate;
}

export interface Investment extends BaseRecord {
  investmentRef: string;
  customerId: string;
  accountId: string;
  productCode: ProductCode;
  principalAmt: Money;
  intRate: Rate;
  effectiveDate: IsoDate;
  tenorDays: number;
  maturityDate: IsoDate;
  annivFreqDays: AnnivFreq;
  nextAnnivDate: IsoDate | null;
  intPaidToDate: Money;
  status: InvestmentStatus;
  parentInvestmentId: string | null;
  originTxnId: string | null;
  closedTxnId: string | null;
  closedDate: IsoDate | null;
  createdAt: IsoDateTime;
}

export interface Beneficiary extends BaseRecord {
  customerId: string;
  benefName: string;
  bankCode: string;
  accountNo: string;
  accountType: AccountType;
  isInternal: boolean;
  createdAt: IsoDateTime;
}

/** Everything the wizard collects that is scenario-specific. All optional; validated by calc. */
export interface TxnInput {
  // amounts
  amount?: Money; // inflow / third party / transfer / partial preliq requested (R)
  rollAmt?: Money; // rollover C: amount to roll (X)
  // dates
  valueDate?: IsoDate; // liquidation / transfer / new effective date
  // new terms
  newRate?: Rate;
  newTenorDays?: number;
  productCode?: ProductCode;
  annivFreqDays?: AnnivFreq;
  // anniversary
  annivPeriod?: 30 | 60 | 90;
  // third party / transfer
  beneficiaryId?: string;
  // per-transaction switches (undefined = on); switching one off requires a reason
  whtOn?: boolean; // deduct withholding tax on this transaction
  whtOffReason?: string;
  preliqChargeOn?: boolean; // apply the pre-liquidation charge on this transaction
  preliqChargeOffReason?: string;
  creditTo?: CreditTarget; // Inflow B: where the funds are credited
  creditAccountNo?: string; // Inflow B: the account credited (Call, overdraft, other)
  creditOther?: string; // Inflow B: what "Other" is
  cotRatePerMille?: string; // COT transaction: ₦ per ₦1,000 of turnover, chosen on each transaction
  // reversal corrected values
  correctedRate?: Rate;
  correctedTenorDays?: number;
  correctedAmount?: Money;
  // free text
  remarks?: string;
}

export interface TreasuryTxn extends BaseRecord {
  txnRef: string;
  txnType: TxnType;
  scenarioCode: ScenarioCode;
  customerId: string;
  investmentId: string | null;
  sourceAccountId: string | null;
  destAccountId: string | null;
  reversalOfTxnId: string | null;
  reversedByTxnId: string | null;
  resultInvestmentId: string | null;
  /** The batch it was last submitted in, if any. */
  batchId: string | null;
  status: TxnStatus;
  wizardStep: number;
  makerId: string;
  receivedAt: IsoDateTime | null;
  submittedAt: IsoDateTime | null;
  slaDueAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  cycleNo: number;
  input: TxnInput;
  headlineAmt: Money;
  returnComment: string | null;
  stopReason: string | null;
  rejectReason: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Instruction extends BaseRecord {
  txnId: string;
  channel: InstructionChannel;
  receivedDate: IsoDate;
  receivedTime: string; // HH:mm
  amount: Money;
  purpose: string;
  payDestination: PayDestination;
  benefName: string | null;
  bankCode: string | null;
  accountNo: string | null;
  accountType: AccountType | null;
}

export interface Verification extends BaseRecord {
  txnId: string;
  sigOk: boolean;
  mandateOk: boolean;
  ownershipOk: boolean;
  completeOk: boolean;
  cbsConfirmed: boolean;
  cbsSyncedAt: IsoDateTime | null;
  fundsReceived: boolean;
  sourceConfirmed: boolean;
  verifiedBy: string | null;
  verifiedAt: IsoDateTime | null;
  /** Internal Audit re-verifies the signature before signing; valid for one approval cycle. */
  auditVerifiedBy: string | null;
  auditVerifiedAt: IsoDateTime | null;
  auditCycleNo: number | null;
}

export interface CallbackLog extends BaseRecord {
  txnId: string;
  customerId: string;
  phoneCalled: string;
  callDate: IsoDate;
  callTime: string;
  officerId: string;
  amountOk: boolean;
  instrOk: boolean;
  benefOk: boolean;
  purposeOk: boolean;
  outcome: CallbackOutcome;
  notes: string;
  createdAt: IsoDateTime;
}

export type VoucherRowFormat = 'money' | 'date' | 'rate' | 'days' | 'text';

export interface VoucherRow {
  label: string;
  /** Raw value: money string, ISO date, rate, day count or text — formatted by the screen. */
  value: string;
  format: VoucherRowFormat;
  kind: VoucherRowKind;
  formula?: string;
  note?: string;
}

export interface PaymentInstr {
  benefName: string;
  bankCode: string;
  bankName: string;
  accountNo: string;
  accountType: AccountType;
  amount: Money;
  transferCharge: Money;
}

export interface Voucher extends BaseRecord {
  voucherNo: string;
  txnId: string;
  seqNo: number; // 1 or 2 within the transaction
  voucherType: VoucherType;
  principalAmt: Money;
  interestAmt: Money;
  whtAmt: Money;
  chargeAmt: Money;
  feeAmt: Money;
  /** Commission on turnover deducted from the payout. */
  cotAmt: Money;
  netAmt: Money;
  rollAmt: Money;
  transferDate: IsoDate;
  effectiveDate: IsoDate | null;
  newRate: Rate | null;
  newTenorDays: number | null;
  newMaturityDate: IsoDate | null;
  projectedInterest: Money;
  remarks: string;
  rows: VoucherRow[];
  notes: string[];
  payment: PaymentInstr | null;
  createdAt: IsoDateTime;
}

export interface Approval extends BaseRecord {
  txnId: string;
  cycleNo: number;
  levelNo: number;
  roleCode: RoleCode;
  userId: string;
  action: ApprovalAction;
  comments: string;
  actedAt: IsoDateTime;
  /** APP = signed in TreasuryDesk; PAPER = signed on a printed voucher, uploaded by the maker. */
  channel: ApprovalChannel;
  /** Who uploaded a paper signature (the maker); null when signed in the app. */
  recordedBy: string | null;
  /** True once the transaction was sent back to an earlier level after this signature. */
  superseded: boolean;
}

export interface Execution extends BaseRecord {
  txnId: string;
  attemptNo: number;
  /** The Eazybankz posting reference (required when the payment went through). */
  cbsPostingRef: string | null;
  /** The GAPS payment reference Operations copied from GAPS. */
  gapsRef: string | null;
  /**
   * What the recording officer reports happened when they paid in GAPS (or posted in Eazybankz). TreasuryDesk
   * never sends or holds money; it only records the outcome.
   */
  outcome: 'SUCCESS' | 'FAILED';
  status: ExecutionStatus;
  /** Why the payment failed (e.g. "Destination bank not available"), as recorded. */
  failureReason: string | null;
  /** Why the approving officer sent the record back to be corrected. */
  returnReason: string | null;
  /** The Operations officer who recorded the payment. */
  executedBy: string;
  executedAt: IsoDateTime;
  /** The second Operations officer who approved the record; null until approved. */
  approvedBy: string | null;
  approvedAt: IsoDateTime | null;
  confirmedBy: string | null;
  confirmedAt: IsoDateTime | null;
}

export interface ControlCheck extends BaseRecord {
  txnId: string;
  controlCode: ControlCode;
  state: ControlState;
  actedBy: string | null;
  actedAt: IsoDateTime | null;
  note: string | null;
}

export interface TxnComment extends BaseRecord {
  txnId: string;
  userId: string;
  body: string;
  createdAt: IsoDateTime;
  editedAt: IsoDateTime | null;
  /** Deleted comments are kept (hidden from the working view, visible to Internal Audit). */
  deletedAt: IsoDateTime | null;
  deletedBy: string | null;
}

/** RECORDED: uploaded and counting; CONFIRMED / DISPUTED: answered by the approver named on it. */
export type PaperSignatureStatus = 'RECORDED' | 'CONFIRMED' | 'DISPUTED';

/**
 * A signature on paper, uploaded by the maker for an approver. The upload completes that step (the client's
 * process); the named approver is told and can confirm it or dispute it.
 */
export interface PaperSignature extends BaseRecord {
  txnId: string;
  cycleNo: number;
  levelNo: number;
  roleCode: RoleCode;
  /** The approver named as having signed. */
  signedBy: string;
  /** The maker who uploaded the scan. */
  recordedBy: string;
  recordedAt: IsoDateTime;
  reason: string;
  status: PaperSignatureStatus;
  decidedAt: IsoDateTime | null;
  disputeReason: string | null;
  /** The approval the upload created. */
  approvalId: string | null;
}

export type AttachmentKind = 'INSTRUCTION' | 'SUPPORTING' | 'PAPER_SIGNATURE';

/** A file attached to a transaction. Several of each kind are allowed. */
export interface Attachment extends BaseRecord {
  txnId: string;
  kind: AttachmentKind;
  /** The approval a paper signature belongs to. */
  approvalId: string | null;
  /** The paper signature this scan supports. */
  paperSignatureId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** The file itself, as a data URL. Null for seeded placeholders. */
  dataUrl: string | null;
  uploadedBy: string;
  uploadedAt: IsoDateTime;
  /** Removed documents are kept (hidden from the working view, visible to Internal Audit). */
  deletedAt: IsoDateTime | null;
  deletedBy: string | null;
}

export type RecallStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
/** TO_MAKER = back to the Treasury Officer; TO_REQUESTER = back to the person who asked. */
export type RecallDecision = 'TO_MAKER' | 'TO_REQUESTER';

/** Someone other than the maker asks the Treasury Officer to recall a submitted transaction. */
export interface RecallRequest extends BaseRecord {
  txnId: string;
  requestedBy: string;
  reason: string;
  requestedAt: IsoDateTime;
  status: RecallStatus;
  decision: RecallDecision | null;
  decidedBy: string | null;
  decidedAt: IsoDateTime | null;
  decisionNote: string;
}

/** Several transactions submitted together with one signature. */
export interface TxnBatch extends BaseRecord {
  batchRef: string;
  makerId: string;
  txnIds: string[];
  note: string;
  createdAt: IsoDateTime;
}

export type ImportRegister =
  'CUSTOMERS' | 'ACCOUNTS' | 'INVESTMENTS' | 'BENEFICIARIES' | 'BANKS' | 'HOLIDAYS';

export type ImportStatus = 'PENDING_APPROVAL' | 'APPLIED' | 'REJECTED';

/** A file of opening data uploaded by staff: validated on upload, applied once approved. */
export interface ImportBatch extends BaseRecord {
  batchRef: string;
  register: ImportRegister;
  fileName: string;
  /** Rows that passed validation, in file order, keyed by column. */
  rows: Record<string, string>[];
  /** Rows that failed, kept so the uploader can see what was left out. */
  rejectedRows: { line: number; errors: string[] }[];
  status: ImportStatus;
  uploadedBy: string;
  uploadedAt: IsoDateTime;
  decidedBy: string | null;
  decidedAt: IsoDateTime | null;
  comments: string;
  /** Records actually created when the batch was applied. */
  createdCount: number;
  /** Rows that could not be written when the batch was applied, and why. */
  skippedRows: { row: number; reason: string }[];
}

export interface Notification extends BaseRecord {
  targetRole: RoleCode | null;
  targetUserId: string | null;
  title: string;
  body: string;
  link: string;
  createdAt: IsoDateTime;
  readBy: string[];
  clearedBy: string[];
}

export interface AuditEvent extends BaseRecord {
  seqNo: number;
  ts: IsoDateTime;
  userId: string;
  roleCode: RoleCode | 'SYSTEM';
  entity: string;
  entityId: string;
  action: string;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddr: string;
  prevHash: string;
  hash: string;
}

export type AuditReviewStatus = 'VERIFIED' | 'FLAGGED' | 'NOT_REVIEWED';

/**
 * Internal Audit's review of one audit-trail entry. Append-only: the newest row for an entry is its current status,
 * the older rows its history (e.g. flagged, then verified once explained).
 */
export interface AuditReview extends BaseRecord {
  auditEventId: string;
  auditSeqNo: number;
  status: AuditReviewStatus;
  note: string;
  reviewedBy: string;
  reviewedAt: IsoDateTime;
}

export type WhtBasisPreliq = 'AFTER_CHARGE' | 'GROSS';
export type PartialPreliqInterest = 'NOT_PAID' | 'PAID_OUT' | 'CAPITALISED';
export type TpFeeMode = 'DEDUCT' | 'ON_TOP';
export type RolloverCInterest = 'PAY_OUT' | 'ROLL';
export type RolloverABasis = 'NET' | 'GROSS';
export type MaturityHolidayRule = 'NEXT_BUSINESS_DAY' | 'NONE';

export interface Settings {
  whtRate: Rate;
  preliqChargeRate: Rate;
  transferFeeRate: Rate;
  dayCount: 365 | 360;
  whtOnAnniversary: boolean;
  whtBasisPreliq: WhtBasisPreliq;
  partialPreliqInterest: PartialPreliqInterest;
  tpFeeMode: TpFeeMode;
  rolloverCInterest: RolloverCInterest;
  rolloverABasis: RolloverABasis;
  maturityHolidayRule: MaturityHolidayRule;
  slaHours: number;
  slaCutoff: string; // HH:mm
  demoLatencyMs: number;
}

/** Stored settings row (maps to SYS_SETTING key/value rows in Oracle). */
export interface SysSettingsRecord extends BaseRecord {
  values: Settings;
  updatedAt: IsoDateTime;
  updatedBy: string;
}

export interface PublicHoliday extends BaseRecord {
  holidayDate: IsoDate;
  description: string;
}

export interface IntegrationConfig extends BaseRecord {
  code: 'EAZYBANKZ' | 'GAPS' | 'NIP' | 'ORACLE' | 'AD' | 'MSG';
  name: string;
  description: string;
  endpoint: string;
  username: string;
  timeoutMs: number;
  enabled: boolean;
  lastTestAt: IsoDateTime | null;
  lastTestOk: boolean | null;
  lastTestMs: number | null;
}

// ─── Service contracts ───────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

export interface ListQuery<F = Record<string, unknown>> {
  page?: number; // 1-based
  pageSize?: number;
  sort?: { field: string; dir: SortDir };
  filters?: F;
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

/** Context passed to every write: who acts and when (lets the seed replay back-dated history). */
export interface Ctx {
  userId: string;
  at: IsoDateTime;
}
