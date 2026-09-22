// ─── Core domain types for TreasuryDesk ───────────────────────────────────────
// All money fields are strings (Decimal.js compatible)
// All business dates are "YYYY-MM-DD" strings
// All timestamps are full ISO with +01:00 (Africa/Lagos)

export type TxnStatus =
  | 'DRAFT' |'VERIFICATION' |'STOPPED' |'PENDING_HEAD_TREASURY' |'PENDING_MIS' |'PENDING_AUDIT' |'PENDING_MD' |'PENDING_OPERATIONS' |'EXEC_FAILED' |'EXECUTED' |'COMPLETED' |'RETURNED' |'REJECTED' |'CANCELLED'
  // Legacy statuses kept for backward compat
  | 'PENDING_VERIFY' |'PENDING_CALLBACK' |'PENDING_CBS' |'PENDING_VOUCHER' |'PENDING_TO' |'PENDING_HT' |'PENDING_OPS' |'CONFIRMED' |'CLOSED';

export type TxnType =
  | 'INFLOW' |'ROLLOVER' |'MATURITY' |'PRELIQ' |'ANNIVERSARY' |'THIRD_PARTY' |'TRANSFER'
  // Legacy types
  | 'FO' | 'FD' | 'TB' | 'CP' | 'RP' | 'OD';

export type InvestmentProduct = 'TERM' | 'CP' | 'CALL';
export type InvestmentStatus = 'ACTIVE' | 'MATURED' | 'ROLLED' | 'TERMINATED' | 'AWAITING_INSTRUCTION';
export type MandateRule = 'SOLE' | 'ANY_TWO' | 'A_AND_B';
export type SignatoryClass = 'A' | 'B';
export type CustomerType = 'INDIVIDUAL' | 'CORPORATE';

export type ApprovalLevel = 'TO' | 'HT' | 'MIS' | 'AUDIT' | 'MD';
export type ApprovalAction = 'APPROVED' | 'REJECTED' | 'RETURNED';
export type UserRole =
  | 'TREASURY_OFFICER' |'ACCOUNT_OFFICER' |'HEAD_TREASURY' |'MIS' |'INTERNAL_AUDIT' |'MANAGING_DIRECTOR' |'OPERATIONS' |'SYSTEM_ADMIN';

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  VERIFICATION: 'Verification',
  STOPPED: 'Stopped',
  PENDING_HEAD_TREASURY: 'Pending Head Treasury',
  PENDING_MIS: 'Pending MIS',
  PENDING_AUDIT: 'Pending Audit',
  PENDING_MD: 'Pending MD',
  PENDING_OPERATIONS: 'Pending Operations',
  EXEC_FAILED: 'Execution Failed',
  EXECUTED: 'Executed',
  COMPLETED: 'Completed',
  RETURNED: 'Returned',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  // Legacy
  PENDING_VERIFY: 'Pending Mandate Verify',
  PENDING_CALLBACK: 'Pending Callback',
  PENDING_CBS: 'Pending CBS Verify',
  PENDING_VOUCHER: 'Pending Voucher',
  PENDING_TO: 'Pending Treasury Officer',
  PENDING_HT: 'Pending Head Treasury',
  PENDING_OPS: 'Pending Operations',
  CONFIRMED: 'Confirmed',
  CLOSED: 'Closed',
};

export const TXN_TYPE_LABELS: Record<string, string> = {
  INFLOW: 'New Inflow',
  ROLLOVER: 'Rollover',
  MATURITY: 'Maturity Payout',
  PRELIQ: 'Pre-Liquidation',
  ANNIVERSARY: 'Anniversary Payment',
  THIRD_PARTY: 'Third-Party Transfer',
  TRANSFER: 'Internal Transfer',
  // Legacy
  FO: 'Fixed Deposit Rollover',
  FD: 'Fixed Deposit',
  TB: 'Treasury Bill',
  CP: 'Commercial Paper',
  RP: 'Repurchase Agreement',
  OD: 'Overnight Deposit',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  TREASURY_OFFICER: 'Treasury Officer',
  ACCOUNT_OFFICER: 'Account Officer',
  HEAD_TREASURY: 'Head Treasury',
  MIS: 'MIS',
  INTERNAL_AUDIT: 'Internal Audit',
  MANAGING_DIRECTOR: 'Managing Director',
  OPERATIONS: 'Operations',
  SYSTEM_ADMIN: 'System Admin',
};

export const APPROVAL_LEVEL_LABELS: Record<ApprovalLevel, string> = {
  TO: 'Treasury Officer',
  HT: 'Head Treasury',
  MIS: 'MIS',
  AUDIT: 'Internal Audit',
  MD: 'Managing Director',
};

export interface AppUser {
  id: string;
  version: number;
  email: string;
  name: string;
  role: UserRole;
  department: string;
  staffId: string;
  avatarInitials: string;
  isActive: boolean;
  lastLogin?: string;
}

export interface Bank {
  id: string;
  version: number;
  cbnCode: string;
  name: string;
  shortName: string;
  isActive: boolean;
}

export interface Account {
  id: string;
  version: number;
  customerId: string;
  nuban: string;
  accountType: 'SS' | 'PA' | 'CA' | 'SA';
  accountTypeLabel: string;
  balance: string;
  currency: string;
  isActive: boolean;
}

export interface Signatory {
  id: string;
  version: number;
  customerId: string;
  name: string;
  signatoryClass: SignatoryClass;
  specimenSvg: string;
  isActive: boolean;
}

export interface Mandate {
  id: string;
  version: number;
  customerId: string;
  rule: MandateRule;
  description: string;
  isActive: boolean;
}

export interface Customer {
  id: string;
  version: number;
  cif: string;
  name: string;
  customerType: CustomerType;
  phone: string;
  email: string;
  bvn: string;
  accountOfficerId: string;
  accountOfficerName: string;
  isActive: boolean;
  isWhtExempt: boolean;
  kycStatus: 'VERIFIED' | 'PENDING' | 'EXPIRED';
  createdAt: string;
  // Legacy fields
  accountNumber?: string;
  accountType?: string;
  relationshipOfficer?: string;
}

export interface Investment {
  id: string;
  version: number;
  customerId: string;
  customerName: string;
  customerCif: string;
  accountId: string;
  nuban: string;
  product: InvestmentProduct;
  principalAmt: string;
  intRate: string;
  effectiveDate: string;
  tenorDays: number;
  maturityDate: string;
  interestAmt: string;
  withholdingTax: string;
  netInterest: string;
  totalPayout: string;
  anniversaryFrequencyDays?: number;
  nextAnniversaryDate?: string;
  cbsRef: string;
  status: InvestmentStatus;
  createdAt: string;
  // Legacy
  type?: string;
}

export interface Beneficiary {
  id: string;
  version: number;
  customerId: string;
  customerName: string;
  beneficiaryName: string;
  bankId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isActive: boolean;
  createdAt: string;
}

export interface PublicHoliday {
  id: string;
  version: number;
  date: string;
  name: string;
  year: number;
  isEditable: boolean;
}

export interface SysSetting {
  key: string;
  value: string;
  label: string;
  group: string;
}

export interface CallbackLog {
  id: string;
  version: number;
  txnId: string;
  customerId: string;
  calledBy: string;
  calledAt: string;
  phoneUsed: string;
  outcome: 'CONFIRMED' | 'NO_ANSWER' | 'DISPUTED' | 'RESCHEDULED';
  notes: string;
  nextCallAt?: string;
}

export interface Instruction {
  id: string;
  version: number;
  txnId: string;
  instructionDate: string;
  instructionType: string;
  details: string;
  receivedBy: string;
  receivedAt: string;
}

export interface Verification {
  id: string;
  version: number;
  txnId: string;
  mandateVerified: boolean;
  signatoryIds: string[];
  verifiedBy: string;
  verifiedAt: string;
  notes: string;
}

export interface Voucher {
  id: string;
  version: number;
  txnId: string;
  voucherNo: string;
  principalAmt: string;
  intRate: string;
  tenorDays: number;
  interestAmt: string;
  withholdingTax: string;
  netInterest: string;
  totalPayout: string;
  valueDate: string;
  maturityDate: string;
  narration: string;
  generatedBy: string;
  generatedAt: string;
}

export interface ControlCheck {
  id: string;
  version: number;
  txnId: string;
  checkCode: string;
  checkLabel: string;
  passed: boolean;
  checkedAt: string;
  checkedBy: string;
  notes?: string;
}

export interface Approval {
  id: string;
  version: number;
  txnId: string;
  level: ApprovalLevel;
  sequence: number;
  approver?: string;
  approverId?: string;
  action?: ApprovalAction;
  comment?: string;
  actionAt?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'SKIPPED';
}

export interface Execution {
  id: string;
  version: number;
  txnId: string;
  executionRef: string;
  channel: string;
  notes: string;
  executedBy: string;
  executedById: string;
  executedAt: string;
  status: 'SUCCESS' | 'FAILED';
}

export interface AuditEvent {
  id: string;
  version: number;
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  performedById: string;
  performedAt: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress: string;
}

export interface TreasuryTxn {
  id: string;
  version: number;
  ref: string;
  customerId: string;
  customerName: string;
  customerCif: string;
  accountNumber: string;
  investmentId?: string;
  type: TxnType;
  principalAmt: string;
  intRate: string;
  tenorDays: number;
  effectiveDate: string;
  maturityDate: string;
  interestAmt: string;
  withholdingTax: string;
  netInterest: string;
  totalPayout: string;
  status: TxnStatus;
  currentApprovalLevel?: ApprovalLevel;
  voucherId?: string;
  voucherNo?: string;
  cbsRef?: string;
  mandateVerified: boolean;
  callbackDone: boolean;
  cbsVerified: boolean;
  initiatedBy: string;
  initiatedById: string;
  initiatedAt: string;
  updatedAt: string;
  approvals: Approval[];
  controlChecks?: ControlCheck[];
  executionRef?: string;
  executionNotes?: string;
  executedBy?: string;
  executedAt?: string;
  confirmedAt?: string;
  slaBreached?: boolean;
  slaCutoffTime?: string;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  sort?: { field: string; dir: 'asc' | 'desc' };
  filters?: Record<string, string | string[] | undefined>;
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface DashboardStats {
  txnsToday: number;
  pendingApprovals: number;
  maturingToday: number;
  totalAum: string;
  pendingCallbacks: number;
  rejectedToday: number;
  pendingOps: number;
}