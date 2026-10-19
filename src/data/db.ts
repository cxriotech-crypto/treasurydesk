/** Shape of the in-memory database (one table per entity). */
import type {
  Account,
  AppUser,
  Approval,
  Attachment,
  AuditEvent,
  Bank,
  Beneficiary,
  CallbackLog,
  ControlCheck,
  Customer,
  Execution,
  Instruction,
  AuditReview,
  ImportBatch,
  IntegrationConfig,
  Investment,
  Mandate,
  Notification,
  PaperSignature,
  PublicHoliday,
  RecallRequest,
  Signatory,
  SysSettingsRecord,
  TreasuryTxn,
  TxnBatch,
  TxnComment,
  Verification,
  Voucher,
} from '@/domain/types';

export const SCHEMA_VERSION = 6;

export interface Db {
  schemaVersion: number;
  /** Lagos business date the seed was generated for. */
  seedDate: string;
  seededAt: string;
  /** Monotonic counters for ids and reference numbers. */
  counters: Record<string, number>;
  users: AppUser[];
  banks: Bank[];
  customers: Customer[];
  signatories: Signatory[];
  mandates: Mandate[];
  accounts: Account[];
  investments: Investment[];
  beneficiaries: Beneficiary[];
  txns: TreasuryTxn[];
  instructions: Instruction[];
  verifications: Verification[];
  callbacks: CallbackLog[];
  vouchers: Voucher[];
  approvals: Approval[];
  paperSignatures: PaperSignature[];
  executions: Execution[];
  controls: ControlCheck[];
  comments: TxnComment[];
  notifications: Notification[];
  audit: AuditEvent[];
  imports: ImportBatch[];
  auditReviews: AuditReview[];
  attachments: Attachment[];
  recalls: RecallRequest[];
  batches: TxnBatch[];
  settings: SysSettingsRecord;
  holidays: PublicHoliday[];
  integrations: IntegrationConfig[];
}

export type TableName = {
  [K in keyof Db]: Db[K] extends Array<{ id: string; version: number }> ? K : never;
}[keyof Db];

export type RowOf<T extends TableName> = Db[T] extends Array<infer R> ? R : never;

export function emptyDb(settings: SysSettingsRecord, seedDate: string, seededAt: string): Db {
  return {
    schemaVersion: SCHEMA_VERSION,
    seedDate,
    seededAt,
    counters: {},
    users: [],
    banks: [],
    customers: [],
    signatories: [],
    mandates: [],
    accounts: [],
    investments: [],
    beneficiaries: [],
    txns: [],
    instructions: [],
    verifications: [],
    callbacks: [],
    vouchers: [],
    approvals: [],
    paperSignatures: [],
    executions: [],
    controls: [],
    comments: [],
    notifications: [],
    audit: [],
    imports: [],
    auditReviews: [],
    attachments: [],
    recalls: [],
    batches: [],
    settings,
    holidays: [],
    integrations: [],
  };
}
