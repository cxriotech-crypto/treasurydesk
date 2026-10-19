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
  'PENDING_ACCOUNT_OFFICER',
  'PENDING_HEAD_TREASURY',
  'PENDING_MIS',
  'PENDING_AUDIT',
  'PENDING_MD',
  'PENDING_OPERATIONS',
  'PENDING_OPS_APPROVAL',
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
    VERIFICATION: { label: 'In preparation', owner: ['TO'], tone: 'info' },
    STOPPED: { label: 'Stopped – signature mismatch', owner: ['TO'], tone: 'danger' },
    PENDING_ACCOUNT_OFFICER: {
      label: 'Awaiting Account Officer',
      owner: ['AO'],
      tone: 'warning',
    },
    PENDING_HEAD_TREASURY: { label: 'Awaiting Head Treasury', owner: ['HT'], tone: 'warning' },
    PENDING_MIS: { label: 'Awaiting MIS', owner: ['MIS'], tone: 'warning' },
    PENDING_AUDIT: { label: 'Awaiting Audit', owner: ['AUD'], tone: 'warning' },
    PENDING_MD: { label: 'Awaiting MD', owner: ['MD'], tone: 'warning' },
    PENDING_OPERATIONS: { label: 'Ready for Operations', owner: ['OPS'], tone: 'accent' },
    PENDING_OPS_APPROVAL: {
      label: 'Awaiting Operations approval',
      owner: ['OPS'],
      tone: 'accent',
    },
    EXEC_FAILED: { label: 'Payment failed', owner: ['OPS'], tone: 'danger' },
    EXECUTED: { label: 'Executed – awaiting confirmation', owner: ['TO'], tone: 'info' },
    COMPLETED: { label: 'Completed', owner: [], tone: 'success' },
    RETURNED: { label: 'Returned for correction', owner: ['TO'], tone: 'warning' },
    REJECTED: { label: 'Rejected', owner: [], tone: 'danger' },
    CANCELLED: { label: 'Cancelled', owner: [], tone: 'neutral' },
  };

export const OPEN_STATUSES: TxnStatus[] = [
  'DRAFT',
  'VERIFICATION',
  'PENDING_ACCOUNT_OFFICER',
  'PENDING_HEAD_TREASURY',
  'PENDING_MIS',
  'PENDING_AUDIT',
  'PENDING_MD',
  'PENDING_OPERATIONS',
  'PENDING_OPS_APPROVAL',
  'EXEC_FAILED',
  'EXECUTED',
  'RETURNED',
];

export const CLOSED_STATUSES: TxnStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED', 'STOPPED'];

/**
 * Approval levels. Level 1 is the maker's own signature (TO). Level 2 is the customer's Account
 * Officer, who calls the customer and checks the transaction (maker-checker) before it goes on to
 * Head of Treasury; their control is the telephone confirmation (C03).
 */
export const APPROVAL_LEVELS = [
  { levelNo: 1, roleCode: 'TO', label: 'Treasury Officer', pendingStatus: null, control: 'C06' },
  {
    levelNo: 2,
    roleCode: 'AO',
    label: 'Account Officer',
    pendingStatus: 'PENDING_ACCOUNT_OFFICER',
    control: 'C03',
  },
  {
    levelNo: 3,
    roleCode: 'HT',
    label: 'Head, Treasury',
    pendingStatus: 'PENDING_HEAD_TREASURY',
    control: 'C07',
  },
  { levelNo: 4, roleCode: 'MIS', label: 'MIS', pendingStatus: 'PENDING_MIS', control: 'C08' },
  {
    levelNo: 5,
    roleCode: 'AUD',
    label: 'Internal Audit',
    pendingStatus: 'PENDING_AUDIT',
    control: 'C09',
  },
  {
    levelNo: 6,
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

export type ApprovalLevelNo = 1 | 2 | 3 | 4 | 5 | 6;

export const PENDING_APPROVAL_STATUSES: TxnStatus[] = [
  'PENDING_ACCOUNT_OFFICER',
  'PENDING_HEAD_TREASURY',
  'PENDING_MIS',
  'PENDING_AUDIT',
  'PENDING_MD',
];

export function levelForStatus(status: TxnStatus): (typeof APPROVAL_LEVELS)[number] | undefined {
  return APPROVAL_LEVELS.find((l) => l.pendingStatus === status);
}

/** Statuses from which the maker can still recall: submitted, not yet executed. */
export const RECALLABLE_STATUSES: TxnStatus[] = [
  ...PENDING_APPROVAL_STATUSES,
  'PENDING_OPERATIONS',
  'PENDING_OPS_APPROVAL',
  'EXEC_FAILED',
];

/** Where a transaction sits in the chain: 2..6 = approval level, 7 = Operations. 0 = not in it. */
export function chainPosition(status: TxnStatus): number {
  const level = levelForStatus(status);
  if (level) return level.levelNo;
  if (['PENDING_OPERATIONS', 'PENDING_OPS_APPROVAL', 'EXEC_FAILED'].includes(status)) return 7;
  return 0;
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
  'COT',
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
  INFLOW: {
    sop: 7,
    label: 'Inflow',
    description: 'Book a new investment, or credit an account',
  },
  COT: {
    sop: 0, // not an SOP transaction: added at the client's request
    label: 'Commission on turnover',
    description: 'Charge COT on a Call / CMS account',
  },
};

export const VOUCHER_TYPES = ['FI', 'FO', 'RO', 'TS', 'CT'] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_TYPE_META: Record<
  VoucherType,
  { label: string; title: string; prefix: string }
> = {
  FI: { label: 'Funds-In Voucher', title: 'FUNDS-IN VOUCHER', prefix: 'FI' },
  FO: { label: 'Funds-Out Voucher', title: 'FUNDS-OUT VOUCHER', prefix: 'FO' },
  RO: { label: 'Roll-over Slip', title: 'ROLL-OVER SLIP', prefix: 'RO' },
  TS: { label: 'Transfer Slip', title: 'TRANSFER SLIP', prefix: 'TS' },
  CT: { label: 'COT Voucher', title: 'COMMISSION ON TURNOVER VOUCHER', prefix: 'CT' },
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
  'INFLOW_ACCOUNT',
  'COT_CMS',
] as const;
export type ScenarioCode = (typeof SCENARIO_CODES)[number];

export interface ScenarioMeta {
  txnType: TxnType;
  letter: string;
  label: string;
  description: string;
  /** The one voucher issued. A transaction that both pays out and rolls over carries both on one voucher. */
  vouchers: VoucherType[];
  /** Money leaves to the customer or a beneficiary (a payout or payment section on the voucher). */
  payout: boolean;
  /** What the wizard asks the maker to pick in step 1. */
  subject: 'INVESTMENT' | 'ACCOUNT' | 'TXN' | 'CUSTOMER';
  /**
   * Starts from a customer instruction (with its signature check). False for a bank charge such as COT, which
   * skips those two steps.
   */
  instruction?: false;
}

export const SCENARIO_META: Record<ScenarioCode, ScenarioMeta> = {
  ROLLOVER_A: {
    txnType: 'ROLLOVER',
    letter: 'A',
    label: 'Principal + interest',
    description: 'Roll principal and net interest into a new term',
    vouchers: ['RO'],
    payout: false,
    subject: 'INVESTMENT',
  },
  ROLLOVER_B: {
    txnType: 'ROLLOVER',
    letter: 'B',
    label: 'Principal rolled, interest paid out',
    description: 'Roll principal; pay net interest to the customer',
    vouchers: ['RO'],
    payout: true,
    subject: 'INVESTMENT',
  },
  ROLLOVER_C: {
    txnType: 'ROLLOVER',
    letter: 'C',
    label: 'Partial principal',
    description: 'Roll part of the principal; pay out the balance',
    vouchers: ['RO'],
    payout: true,
    subject: 'INVESTMENT',
  },
  ROLLOVER_D: {
    txnType: 'ROLLOVER',
    letter: 'D',
    label: 'Interest payment only',
    description: 'Pay interest; principal stays invested',
    vouchers: ['RO'],
    payout: true,
    subject: 'INVESTMENT',
  },
  MATURITY: {
    txnType: 'MATURITY',
    letter: '',
    label: 'Principal + interest',
    description: 'Terminate at maturity and pay out',
    vouchers: ['FO'],
    payout: true,
    subject: 'INVESTMENT',
  },
  PRELIQ_FULL: {
    txnType: 'PRELIQ',
    letter: '',
    label: 'Full',
    description: 'Liquidate fully; charge on accrued interest',
    vouchers: ['FO'],
    payout: true,
    subject: 'INVESTMENT',
  },
  PRELIQ_PARTIAL: {
    txnType: 'PRELIQ',
    letter: '',
    label: 'Partial',
    description: 'Pay part of the principal; rebook the rest',
    vouchers: ['FO'],
    payout: true,
    subject: 'INVESTMENT',
  },
  ANNIVERSARY: {
    txnType: 'ANNIVERSARY',
    letter: '',
    label: '30 / 60 / 90 days',
    description: 'Pay periodic interest; investment remains active',
    vouchers: ['FO'],
    payout: true,
    subject: 'INVESTMENT',
  },
  THIRD_PARTY_EXT: {
    txnType: 'THIRD_PARTY',
    letter: 'A',
    label: 'External bank',
    description: 'Pay a beneficiary at another bank (transfer charge applies)',
    vouchers: ['FO'],
    payout: true,
    subject: 'ACCOUNT',
  },
  THIRD_PARTY_INT: {
    txnType: 'THIRD_PARTY',
    letter: 'B',
    label: 'Internal account',
    description: 'Pay another customer account in-house (no charge)',
    vouchers: ['FO'],
    payout: true,
    subject: 'ACCOUNT',
  },
  TRANSFER_SS_PA: {
    txnType: 'TRANSFER',
    letter: 'A',
    label: 'Savings → Personal Account',
    description: 'Move funds from SS to PA',
    vouchers: ['TS'],
    payout: false,
    subject: 'ACCOUNT',
  },
  TRANSFER_PA_CP: {
    txnType: 'TRANSFER',
    letter: 'B',
    label: 'Personal Account → Commercial Paper',
    description: 'Invest PA funds in Commercial Paper',
    vouchers: ['TS'],
    payout: false,
    subject: 'ACCOUNT',
  },
  TRANSFER_PA_CALL: {
    txnType: 'TRANSFER',
    letter: 'C',
    label: 'Personal Account → Call Placement',
    description: 'Invest PA funds in a Call Placement',
    vouchers: ['TS'],
    payout: false,
    subject: 'ACCOUNT',
  },
  TRANSFER_REVERSAL: {
    txnType: 'TRANSFER',
    letter: '',
    label: 'Reversal',
    description: 'Correct the rate, tenor or amount of a completed booking',
    vouchers: ['TS'],
    payout: false,
    subject: 'TXN',
  },
  INFLOW: {
    txnType: 'INFLOW',
    letter: 'A',
    label: 'New investment',
    description: 'Book a new investment from customer funds',
    vouchers: ['FI'],
    payout: false,
    subject: 'CUSTOMER',
  },
  INFLOW_ACCOUNT: {
    txnType: 'INFLOW',
    letter: 'B',
    label: 'Credit to an account',
    description:
      'Credit funds received to the customer’s Personal, Savings or Call / CMS account, or another account',
    vouchers: ['FI'],
    payout: false,
    subject: 'CUSTOMER',
  },
  COT_CMS: {
    txnType: 'COT',
    letter: '',
    label: 'Call / CMS account',
    description:
      'Charge COT on the turnover of a customer’s Call / CMS (current) account, at the rate you choose',
    vouchers: ['CT'],
    payout: false,
    subject: 'ACCOUNT',
    instruction: false,
  },
};

/** Where an inflow credited to an account (Inflow B) goes. */
export const CREDIT_TARGETS = ['PA', 'SS', 'CA', 'OTHER'] as const;
export type CreditTarget = (typeof CREDIT_TARGETS)[number];
export const CREDIT_TARGET_LABELS: Record<CreditTarget, string> = {
  PA: 'Personal Account',
  SS: 'Savings account',
  CA: 'Call / CMS account',
  OTHER: 'Other',
};

/**
 * The approval levels a scenario goes through (1 = Treasury Officer, who always signs first). An inflow credited to
 * an account and a COT charge need only the Head of Treasury before Operations; everything else goes through all
 * six levels.
 */
export function chainLevels(s: ScenarioCode): number[] {
  return s === 'INFLOW_ACCOUNT' || SCENARIO_META[s].txnType === 'COT' ? [1, 3] : [1, 2, 3, 4, 5, 6];
}

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

/** NOT_REQUIRED: an approval level this transaction's route does not include. */
export type ControlState = 'PENDING' | 'PASSED' | 'FAILED' | 'NOT_REQUIRED';

// ─── Other code sets ─────────────────────────────────────────────────────────

export type ProductCode = 'TERM' | 'CP' | 'CALL';
export const PRODUCT_LABELS: Record<ProductCode, string> = {
  TERM: 'Term Deposit',
  CP: 'Commercial Paper',
  CALL: 'Call Placement',
};

/** CA: the Call / CMS account — the customer's current account (Call and CMS are two names for it). */
export type AccountProductCode = 'SS' | 'PA' | 'CA';
export const ACCOUNT_PRODUCT_LABELS: Record<AccountProductCode, string> = {
  SS: 'Savings',
  PA: 'Personal Account',
  CA: 'Call / CMS account',
};
/** First two digits of a new account number for each account type. */
export const ACCOUNT_NO_PREFIX: Record<AccountProductCode, string> = {
  PA: '10',
  SS: '20',
  CA: '30',
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
export type ApprovalAction = 'APPROVE' | 'RETURN' | 'REJECT' | 'RECALL';
export type ApprovalChannel = 'APP' | 'PAPER';
/**
 * PREPARED = the payment outcome was recorded by one Operations officer and awaits a second to approve it.
 * SUCCESS / FAILED = the record was approved. RETURNED = sent back to be corrected.
 */
export type ExecutionStatus = 'PREPARED' | 'SUCCESS' | 'FAILED' | 'RETURNED';

/** Common reasons a GAPS payment fails, offered when Operations record a failure (or type their own). */
export const GAPS_FAILURE_REASONS = [
  'Destination bank not available',
  'Beneficiary account name mismatch',
  'Invalid beneficiary account number',
  'Cut-off time passed',
  'GAPS service unavailable',
] as const;
export type AnnivFreq = 0 | 30 | 60 | 90;
/** `section` heads one part of a voucher that carries two (e.g. the payout and the roll-over). */
export type VoucherRowKind = 'input' | 'calc' | 'info' | 'total' | 'section';
