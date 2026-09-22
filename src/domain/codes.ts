/**
 * Codes (stored in data) and their display labels.
 * Data always carries codes; screens map them to labels through these tables.
 */

export const ROLE_CODES = ['TO', 'AO', 'HT', 'MIS', 'AUD', 'MD', 'OPS', 'ADM'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  TO: 'Treasury Officer',
  AO: 'Account Officer',
  HT: 'Head, Treasury',
  MIS: 'MIS',
  AUD: 'Internal Audit',
  MD: 'Managing Director',
  OPS: 'Operations',
  ADM: 'System Admin',
};

export const TXN_STATUSES = [
  'DRAFT',
  'VERIFICATION',
  'STOPPED',
  'PENDING_HEAD_TREASURY',
  'PENDING_MIS',
  'PENDING_AUDIT',
  'PENDING_MD',
  'PENDING_OPERATIONS',
  'EXEC_FAILED',
  'EXECUTED',
  'COMPLETED',
  'RETURNED',
  'REJECTED',
  'CANCELLED',
] as const;
export type TxnStatus = (typeof TXN_STATUSES)[number];

export type Tone = 'neutral' | 'info' | 'danger' | 'warning' | 'accent' | 'success';

export const TXN_STATUS_META: Record<TxnStatus, { label: string; owner: RoleCode[]; tone: Tone }> =
  {
    DRAFT: { label: 'Draft', owner: ['TO'], tone: 'neutral' },
    VERIFICATION: { label: 'In verification', owner: ['TO', 'AO'], tone: 'info' },
    STOPPED: { label: 'Stopped – signature mismatch', owner: ['TO'], tone: 'danger' },
    PENDING_HEAD_TREASURY: { label: 'Awaiting Head Treasury', owner: ['HT'], tone: 'warning' },
    PENDING_MIS: { label: 'Awaiting MIS', owner: ['MIS'], tone: 'warning' },
    PENDING_AUDIT: { label: 'Awaiting Audit', owner: ['AUD'], tone: 'warning' },
    PENDING_MD: { label: 'Awaiting MD', owner: ['MD'], tone: 'warning' },
    PENDING_OPERATIONS: { label: 'Ready for Operations', owner: ['OPS'], tone: 'accent' },
    EXEC_FAILED: { label: 'Execution failed', owner: ['OPS'], tone: 'danger' },
    EXECUTED: { label: 'Executed – awaiting confirmation', owner: ['TO'], tone: 'info' },
    COMPLETED: { label: 'Completed', owner: [], tone: 'success' },
    RETURNED: { label: 'Returned for correction', owner: ['TO'], tone: 'warning' },
    REJECTED: { label: 'Rejected', owner: [], tone: 'danger' },
    CANCELLED: { label: 'Cancelled', owner: [], tone: 'neutral' },
  };

export const OPEN_STATUSES: TxnStatus[] = [
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

export const CLOSED_STATUSES: TxnStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED', 'STOPPED'];

/** Approval levels. Level 1 is the maker's own signature (TO). */
export const APPROVAL_LEVELS = [
  { levelNo: 1, roleCode: 'TO', label: 'Treasury Officer', pendingStatus: null, control: 'C06' },
  {
    levelNo: 2,
    roleCode: 'HT',
    label: 'Head, Treasury',
    pendingStatus: 'PENDING_HEAD_TREASURY',
    control: 'C07',
  },
  { levelNo: 3, roleCode: 'MIS', label: 'MIS', pendingStatus: 'PENDING_MIS', control: 'C08' },
  {
    levelNo: 4,
    roleCode: 'AUD',
    label: 'Internal Audit',
    pendingStatus: 'PENDING_AUDIT',
    control: 'C09',
  },
  {
    levelNo: 5,
    roleCode: 'MD',
    label: 'Managing Director',
    pendingStatus: 'PENDING_MD',
    control: 'C10',
  },
] as const satisfies ReadonlyArray<{
  levelNo: number;
  roleCode: RoleCode;
  label: string;
  pendingStatus: TxnStatus | null;
  control: string;
}>;

export type ApprovalLevelNo = 1 | 2 | 3 | 4 | 5;

export const PENDING_APPROVAL_STATUSES: TxnStatus[] = [
  'PENDING_HEAD_TREASURY',
  'PENDING_MIS',
  'PENDING_AUDIT',
  'PENDING_MD',
];

export function levelForStatus(status: TxnStatus): (typeof APPROVAL_LEVELS)[number] | undefined {
  return APPROVAL_LEVELS.find((l) => l.pendingStatus === status);
}

export function levelForRole(role: RoleCode): (typeof APPROVAL_LEVELS)[number] | undefined {
  return APPROVAL_LEVELS.find((l) => l.roleCode === role);
}

// ─── Transaction types and scenarios ─────────────────────────────────────────

export const TXN_TYPES = [
  'ROLLOVER',
  'MATURITY',
  'PRELIQ',
  'ANNIVERSARY',
  'THIRD_PARTY',
  'TRANSFER',
  'INFLOW',
] as const;
export type TxnType = (typeof TXN_TYPES)[number];

export const TXN_TYPE_META: Record<TxnType, { sop: number; label: string; description: string }> = {
  ROLLOVER: { sop: 1, label: 'Rollover', description: 'Re-invest a maturing investment' },
  MATURITY: {
    sop: 2,
    label: 'Termination at maturity',
    description: 'Pay out principal and interest',
  },
  PRELIQ: { sop: 3, label: 'Pre-liquidation', description: 'Break an investment before maturity' },
  ANNIVERSARY: { sop: 4, label: 'Anniversary interest', description: 'Periodic interest payment' },
  THIRD_PARTY: {
    sop: 5,
    label: 'Third-party payment',
    description: 'Pay a beneficiary from the customer account',
  },
  TRANSFER: { sop: 6, label: 'Transfer', description: 'Move funds between products' },
  INFLOW: { sop: 7, label: 'Inflow', description: 'Book a new investment' },
};

export const VOUCHER_TYPES = ['FI', 'FO', 'RO', 'TS'] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_TYPE_META: Record<
  VoucherType,
  { label: string; title: string; prefix: string }
> = {
  FI: { label: 'Funds-In Voucher', title: 'FUNDS-IN VOUCHER', prefix: 'FI' },
  FO: { label: 'Funds-Out Voucher', title: 'FUNDS-OUT VOUCHER', prefix: 'FO' },
  RO: { label: 'Roll-over Slip', title: 'ROLL-OVER SLIP', prefix: 'RO' },
  TS: { label: 'Transfer Slip', title: 'TRANSFER SLIP', prefix: 'TS' },
};

export const SCENARIO_CODES = [
  'ROLLOVER_A',
  'ROLLOVER_B',
  'ROLLOVER_C',
  'ROLLOVER_D',
  'MATURITY',
  'PRELIQ_FULL',
  'PRELIQ_PARTIAL',
  'ANNIVERSARY',
  'THIRD_PARTY_EXT',
  'THIRD_PARTY_INT',
  'TRANSFER_SS_PA',
  'TRANSFER_PA_CP',
  'TRANSFER_PA_CALL',
  'TRANSFER_REVERSAL',
  'INFLOW',
] as const;
export type ScenarioCode = (typeof SCENARIO_CODES)[number];

export interface ScenarioMeta {
  txnType: TxnType;
  letter: string;
  label: string;
  description: string;
  vouchers: VoucherType[];
  /** What the wizard asks the maker to pick in step 1. */
  subject: 'INVESTMENT' | 'ACCOUNT' | 'TXN' | 'CUSTOMER';
}

export const SCENARIO_META: Record<ScenarioCode, ScenarioMeta> = {
  ROLLOVER_A: {
    txnType: 'ROLLOVER',
    letter: 'A',
    label: 'Principal + interest',
    description: 'Roll principal and net interest into a new term',
    vouchers: ['RO'],
    subject: 'INVESTMENT',
  },
  ROLLOVER_B: {
    txnType: 'ROLLOVER',
    letter: 'B',
    label: 'Principal rolled, interest paid out',
    description: 'Roll principal; pay net interest to the customer',
    vouchers: ['RO', 'FO'],
    subject: 'INVESTMENT',
  },
  ROLLOVER_C: {
    txnType: 'ROLLOVER',
    letter: 'C',
    label: 'Partial principal',
    description: 'Roll part of the principal; pay out the balance',
    vouchers: ['RO', 'FO'],
    subject: 'INVESTMENT',
  },
  ROLLOVER_D: {
    txnType: 'ROLLOVER',
    letter: 'D',
    label: 'Interest payment only',
    description: 'Pay interest; principal stays invested',
    vouchers: ['FO', 'RO'],
    subject: 'INVESTMENT',
  },
  MATURITY: {
    txnType: 'MATURITY',
    letter: '',
    label: 'Principal + interest',
    description: 'Terminate at maturity and pay out',
    vouchers: ['FO'],
    subject: 'INVESTMENT',
  },
  PRELIQ_FULL: {
    txnType: 'PRELIQ',
    letter: '',
    label: 'Full',
    description: 'Liquidate fully; charge on accrued interest',
    vouchers: ['FO'],
    subject: 'INVESTMENT',
  },
  PRELIQ_PARTIAL: {
    txnType: 'PRELIQ',
    letter: '',
    label: 'Partial',
    description: 'Pay part of the principal; rebook the rest',
    vouchers: ['FO', 'RO'],
    subject: 'INVESTMENT',
  },
  ANNIVERSARY: {
    txnType: 'ANNIVERSARY',
    letter: '',
    label: '30 / 60 / 90 days',
    description: 'Pay periodic interest; investment remains active',
    vouchers: ['FO'],
    subject: 'INVESTMENT',
  },
  THIRD_PARTY_EXT: {
    txnType: 'THIRD_PARTY',
    letter: 'A',
    label: 'External bank',
    description: 'Pay a beneficiary at another bank (transfer charge applies)',
    vouchers: ['FO'],
    subject: 'ACCOUNT',
  },
  THIRD_PARTY_INT: {
    txnType: 'THIRD_PARTY',
    letter: 'B',
    label: 'Internal account',
    description: 'Pay another customer account in-house (no charge)',
    vouchers: ['FO'],
    subject: 'ACCOUNT',
  },
  TRANSFER_SS_PA: {
    txnType: 'TRANSFER',
    letter: 'A',
    label: 'Savings → Personal Account',
    description: 'Move funds from SS to PA',
    vouchers: ['TS'],
    subject: 'ACCOUNT',
  },
  TRANSFER_PA_CP: {
    txnType: 'TRANSFER',
    letter: 'B',
    label: 'Personal Account → Commercial Paper',
    description: 'Invest PA funds in Commercial Paper',
    vouchers: ['TS'],
    subject: 'ACCOUNT',
  },
  TRANSFER_PA_CALL: {
    txnType: 'TRANSFER',
    letter: 'C',
    label: 'Personal Account → Call Placement',
    description: 'Invest PA funds in a Call Placement',
    vouchers: ['TS'],
    subject: 'ACCOUNT',
  },
  TRANSFER_REVERSAL: {
    txnType: 'TRANSFER',
    letter: '',
    label: 'Reversal',
    description: 'Correct the rate, tenor or amount of a completed booking',
    vouchers: ['TS'],
    subject: 'TXN',
  },
  INFLOW: {
    txnType: 'INFLOW',
    letter: '',
    label: 'New investment',
    description: 'Book a new investment from customer funds',
    vouchers: ['FI'],
    subject: 'CUSTOMER',
  },
};

export function scenariosForType(t: TxnType): ScenarioCode[] {
  return SCENARIO_CODES.filter((s) => SCENARIO_META[s].txnType === t);
}

export function scenarioLabel(s: ScenarioCode): string {
  const m = SCENARIO_META[s];
  const type = TXN_TYPE_META[m.txnType].label;
  return m.letter ? `${type} ${m.letter} – ${m.label}` : `${type} – ${m.label}`;
}

// ─── Controls ────────────────────────────────────────────────────────────────

export const CONTROL_CODES = [
  'C01',
  'C02',
  'C03',
  'C04',
  'C05',
  'C06',
  'C07',
  'C08',
  'C09',
  'C10',
  'C11',
  'C12',
] as const;
export type ControlCode = (typeof CONTROL_CODES)[number];

export const CONTROL_LABELS: Record<ControlCode, string> = {
  C01: 'Customer instruction received',
  C02: 'Signature verified',
  C03: 'Telephone confirmation completed',
  C04: 'Investment confirmed in Eazybankz',
  C05: 'Correct voucher raised',
  C06: 'Treasury Officer approval',
  C07: 'Head Treasury approval',
  C08: 'MIS approval',
  C09: 'Audit approval',
  C10: 'MD approval',
  C11: 'Operations processing confirmed',
  C12: 'Transaction completed within GAPS SLA',
};

export type ControlState = 'PENDING' | 'PASSED' | 'FAILED';

// ─── Other code sets ─────────────────────────────────────────────────────────

export type ProductCode = 'TERM' | 'CP' | 'CALL';
export const PRODUCT_LABELS: Record<ProductCode, string> = {
  TERM: 'Term Deposit',
  CP: 'Commercial Paper',
  CALL: 'Call Placement',
};

export type AccountProductCode = 'SS' | 'PA';
export const ACCOUNT_PRODUCT_LABELS: Record<AccountProductCode, string> = {
  SS: 'Savings',
  PA: 'Personal Account',
};

export type InvestmentStatus =
  'ACTIVE' | 'MATURED' | 'LIQUIDATED' | 'ROLLED_OVER' | 'CLOSED' | 'REVERSED';
export const INVESTMENT_STATUS_META: Record<InvestmentStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  MATURED: { label: 'Matured – awaiting instruction', tone: 'warning' },
  LIQUIDATED: { label: 'Liquidated', tone: 'neutral' },
  ROLLED_OVER: { label: 'Rolled over', tone: 'neutral' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  REVERSED: { label: 'Reversed', tone: 'danger' },
};

export type CustomerType = 'IND' | 'CORP';
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  IND: 'Individual',
  CORP: 'Corporate',
};

export type RecordStatus = 'ACTIVE' | 'INACTIVE';
export type SignClass = 'A' | 'B';
export type MandateRule = 'SOLE' | 'ANY_TWO' | 'A_AND_B';
export const MANDATE_RULE_LABELS: Record<MandateRule, string> = {
  SOLE: 'Sole signatory – any one signatory may sign',
  ANY_TWO: 'Any two signatories must sign',
  A_AND_B: 'One Class A and one Class B signatory must sign',
};

export type AccountType = 'SAVINGS' | 'CURRENT';
export type InstructionChannel = 'LETTER' | 'EMAIL' | 'FORM' | 'MANDATE';
export const CHANNEL_LABELS: Record<InstructionChannel, string> = {
  LETTER: 'Letter',
  EMAIL: 'Email',
  FORM: 'Signed instruction form',
  MANDATE: 'Mandated instruction',
};
export type PayDestination = 'EXTERNAL' | 'INTERNAL';
export type CallbackOutcome = 'CONFIRMED' | 'UNREACHABLE' | 'DISPUTED';
export const CALLBACK_OUTCOME_LABELS: Record<CallbackOutcome, string> = {
  CONFIRMED: 'Confirmed',
  UNREACHABLE: 'Unreachable',
  DISPUTED: 'Disputed',
};
export type ApprovalAction = 'APPROVE' | 'RETURN' | 'REJECT';
export type ExecutionStatus = 'SUCCESS' | 'FAILED';
export type AnnivFreq = 0 | 30 | 60 | 90;
export type VoucherRowKind = 'input' | 'calc' | 'info' | 'total';
