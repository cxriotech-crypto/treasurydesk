import type { Beneficiary, ListQuery, ListResult } from '@/domain/types';
import type { AccountType } from '@/domain/codes';
import { INTERNAL_BANK_CODE, INTERNAL_BANK_NAME } from '@/domain/rules';
import { validateAccountNo } from '@/lib/calc';
import { getDb, mutate } from '@/data/store';
import { AppError, findById, getById, matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, run } from './core';
import { ports } from './ports';
import { auditedInsert, auditedRemove, auditedUpdate, fieldErrors } from './crud';

export interface BeneficiaryFilters {
  search?: string;
  customerId?: string;
  isInternal?: boolean;
}

export interface BeneficiaryRow extends Beneficiary {
  bankName: string;
  customerName: string;
}

export interface BeneficiaryInput {
  customerId: string;
  benefName: string;
  bankCode: string;
  accountNo: string;
  accountType: AccountType;
  isInternal: boolean;
}

export interface NameEnquiryResult {
  accountName: string;
  bankName: string;
}

export interface BeneficiariesService {
  list(q?: ListQuery<BeneficiaryFilters>): Promise<ListResult<BeneficiaryRow>>;
  create(input: BeneficiaryInput): Promise<Beneficiary>;
  update(id: string, input: BeneficiaryInput, version: number): Promise<Beneficiary>;
  remove(id: string, version: number): Promise<void>;
  /** Simulated name enquiry (~1 s). */
  nameEnquiry(bankCode: string, accountNo: string): Promise<NameEnquiryResult>;
}

function bankNameOf(code: string): string {
  if (code === INTERNAL_BANK_CODE) return INTERNAL_BANK_NAME;
  return getDb().banks.find((b) => b.bankCode === code)?.bankName ?? code;
}

function validate(input: BeneficiaryInput) {
  const db = getDb();
  const e: Record<string, string> = {};
  if (!findById(db, 'customers', input.customerId)) e.customerId = 'Choose a customer';
  if (!input.benefName?.trim()) e.benefName = 'Beneficiary name is required';
  const acc = validateAccountNo(input.accountNo);
  if (acc) e.accountNo = acc;
  if (!input.accountType) e.accountType = 'Choose an account type';
  if (input.isInternal) {
    if (!acc && !db.accounts.some((a) => a.accountNo === input.accountNo))
      e.accountNo = 'No internal account with this number';
  } else {
    const bank = db.banks.find((b) => b.bankCode === input.bankCode);
    if (!bank) e.bankCode = 'Choose a bank';
    else if (!bank.active) e.bankCode = 'This bank is inactive';
  }
  fieldErrors(e);
}

export const mockBeneficiariesService: BeneficiariesService = {
  list: (q = {}) =>
    run(() => {
      const db = getDb();
      const f = q.filters ?? {};
      const rows = db.beneficiaries
        .filter(
          (b) =>
            (!f.customerId || b.customerId === f.customerId) &&
            (f.isInternal === undefined || b.isInternal === f.isInternal)
        )
        .map((b) => ({
          ...b,
          bankName: bankNameOf(b.bankCode),
          customerName: findById(db, 'customers', b.customerId)?.customerName ?? '',
        }))
        .filter((b) =>
          matchesSearch(f.search, b.benefName, b.accountNo, b.bankName, b.customerName)
        );
      return paginate(rows, { sort: { field: 'benefName', dir: 'asc' }, ...q });
    }),
  create: (input) =>
    run(() => {
      const c = ctx(['TO']);
      validate(input);
      return mutate((db) =>
        auditedInsert(
          db,
          c,
          'beneficiaries',
          {
            ...input,
            benefName: input.benefName.trim(),
            bankCode: input.isInternal ? INTERNAL_BANK_CODE : input.bankCode,
            createdAt: c.at,
          },
          'Beneficiary',
          (b) => `Beneficiary ${b.benefName} (${bankNameOf(b.bankCode)} ${b.accountNo}) saved`
        )
      );
    }),
  update: (id, input, version) =>
    run(() => {
      const c = ctx(['TO']);
      validate(input);
      return mutate((db) =>
        auditedUpdate(
          db,
          c,
          'beneficiaries',
          id,
          {
            benefName: input.benefName.trim(),
            bankCode: input.isInternal ? INTERNAL_BANK_CODE : input.bankCode,
            accountNo: input.accountNo,
            accountType: input.accountType,
            isInternal: input.isInternal,
          },
          version,
          'Beneficiary',
          (b) => `Beneficiary ${b.benefName} updated`
        )
      );
    }),
  remove: (id, version) =>
    run(() => {
      const c = ctx(['TO']);
      getById(getDb(), 'beneficiaries', id, 'beneficiary');
      mutate((db) =>
        auditedRemove(
          db,
          c,
          'beneficiaries',
          id,
          version,
          'Beneficiary',
          (b) => `Beneficiary ${b.benefName} deleted`
        )
      );
    }),
  nameEnquiry: async (bankCode, accountNo) => {
    const local = await run(() => {
      const err = validateAccountNo(accountNo);
      if (err) throw new AppError(err, 'VALIDATION', { accountNo: err });
      const db = getDb();
      if (bankCode === INTERNAL_BANK_CODE) {
        const a = db.accounts.find((x) => x.accountNo === accountNo);
        if (!a)
          throw new AppError('No internal account with this number.', 'NOT_FOUND', {
            accountNo: 'Account not found',
          });
        return { found: { accountName: a.accountName, bankName: INTERNAL_BANK_NAME } };
      }
      const bank = db.banks.find((b) => b.bankCode === bankCode);
      if (!bank)
        throw new AppError('Choose a bank first.', 'VALIDATION', { bankCode: 'Choose a bank' });
      if (!bank.active)
        throw new AppError(`${bank.bankName} is not available for transfers.`, 'VALIDATION', {
          bankCode: 'Bank is inactive',
        });
      // The simulator answers from saved beneficiaries; a real channel is always asked (names change).
      const saved =
        ports().payments.mode === 'simulator'
          ? db.beneficiaries.find((b) => b.bankCode === bankCode && b.accountNo === accountNo)
          : undefined;
      if (saved)
        return { found: { accountName: saved.benefName.toUpperCase(), bankName: bank.bankName } };
      return { ask: bank.bankName };
    });
    if ('found' in local) return local.found!;
    const r = await ports().payments.nameEnquiry(bankCode, accountNo);
    if (!r.ok) throw new AppError(r.reason, 'NOT_FOUND', { accountNo: r.reason });
    return { accountName: r.accountName, bankName: local.ask };
  },
};

export const httpBeneficiariesService: BeneficiariesService = {
  list: (q) => http.get('/beneficiaries', q as Record<string, unknown>),
  create: (input) => http.post('/beneficiaries', input),
  update: (id, input, version) => http.put(`/beneficiaries/${id}`, { ...input, version }),
  remove: (id, version) => http.del(`/beneficiaries/${id}`, { version }),
  nameEnquiry: (bankCode, accountNo) => http.get('/name-enquiry', { bankCode, accountNo }),
};

export const beneficiariesService: BeneficiariesService = USE_MOCK
  ? mockBeneficiariesService
  : httpBeneficiariesService;
