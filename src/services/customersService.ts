import type {
  Account,
  AppUser,
  Beneficiary,
  Customer,
  Investment,
  ListQuery,
  ListResult,
  Mandate,
  Signatory,
} from '@/domain/types';
import {
  MANDATE_RULE_LABELS,
  type CustomerType,
  type MandateRule,
  type RecordStatus,
  type SignClass,
} from '@/domain/codes';
import { isoDatePart } from '@/lib/dates';
import { add, ZERO } from '@/lib/money';
import { createRng } from '@/lib/prng';
import { getDb, mutate } from '@/data/store';
import { specimenSvg } from '@/lib/specimen';
import { AppError, findById, getById, matchesSearch, nextCounter, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, run } from './core';
import { auditedInsert, auditedRemove, auditedUpdate, fieldErrors } from './crud';
import { LOCKING_STATUSES } from './workflow';

export interface CustomerFilters {
  search?: string;
  customerType?: CustomerType;
  status?: RecordStatus;
  accountOfficerId?: string;
  whtExempt?: boolean;
}

export interface CustomerRow extends Customer {
  officerName: string;
  activeInvestments: number;
  aum: string;
}

export interface CustomerDetail {
  customer: Customer;
  officer: AppUser | null;
  signatories: Signatory[];
  mandate: Mandate | null;
  accounts: Account[];
  investments: Investment[];
  beneficiaries: Beneficiary[];
  aum: string;
}

export interface CustomerInput {
  customerName: string;
  customerType: CustomerType;
  regPhone: string;
  email: string;
  address: string;
  /** Full 11-digit BVN on create/update; stored masked. Leave empty on update to keep. */
  bvn?: string;
  whtExempt: boolean;
  accountOfficerId: string;
}

export interface NewCustomerInput extends CustomerInput {
  firstSignatory: { fullName: string; signClass: SignClass };
}

export interface SignatoryInput {
  fullName: string;
  signClass: SignClass;
  active?: boolean;
}

export interface CustomersService {
  list(q?: ListQuery<CustomerFilters>): Promise<ListResult<CustomerRow>>;
  get(id: string): Promise<CustomerDetail>;
  create(input: NewCustomerInput): Promise<Customer>;
  update(id: string, input: CustomerInput, version: number): Promise<Customer>;
  setStatus(id: string, status: RecordStatus, version: number): Promise<Customer>;
  addSignatory(customerId: string, input: SignatoryInput): Promise<Signatory>;
  updateSignatory(id: string, input: SignatoryInput, version: number): Promise<Signatory>;
  removeSignatory(id: string, version: number): Promise<void>;
  setMandate(customerId: string, ruleCode: MandateRule): Promise<Mandate>;
}

const EDITORS = ['TO', 'ADM'] as const;

export function normalisePhone(v: string): string | null {
  const d = v.replace(/\D/g, '');
  const local = d.startsWith('234') ? d.slice(3) : d.startsWith('0') ? d.slice(1) : d;
  if (!/^[789]\d{9}$/.test(local)) return null;
  return `+234 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

function maskBvn(bvn: string): string {
  return `${bvn.slice(0, 3)}*****${bvn.slice(-4)}`;
}

function validate(input: CustomerInput, creating: boolean) {
  const e: Record<string, string> = {};
  if (!input.customerName?.trim()) e.customerName = 'Customer name is required';
  if (!['IND', 'CORP'].includes(input.customerType)) e.customerType = 'Choose a customer type';
  if (!normalisePhone(input.regPhone ?? ''))
    e.regPhone = 'Enter a Nigerian mobile number, e.g. +234 803 123 4567';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? ''))
    e.email = 'Enter a valid email address';
  if (!input.address?.trim()) e.address = 'Address is required';
  if (creating || input.bvn) {
    if (!/^\d{11}$/.test(input.bvn ?? '')) e.bvn = 'BVN must be 11 digits';
  }
  const ao = findById(getDb(), 'users', input.accountOfficerId);
  if (!ao || ao.roleCode !== 'AO' || ao.status !== 'ACTIVE')
    e.accountOfficerId = 'Choose an active Account Officer';
  fieldErrors(e);
}

function aumOf(invs: Investment[]): string {
  return add(
    ZERO,
    ...invs
      .filter((i) => i.status === 'ACTIVE' || i.status === 'MATURED')
      .map((i) => i.principalAmt)
  );
}

function mandateProblem(rule: MandateRule, sigs: Signatory[]): string | null {
  const active = sigs.filter((s) => s.active);
  if (active.length === 0) return 'At least one active signatory is required';
  if (rule === 'ANY_TWO' && active.length < 2)
    return 'Any-two mandate needs at least two active signatories';
  if (
    rule === 'A_AND_B' &&
    !(active.some((s) => s.signClass === 'A') && active.some((s) => s.signClass === 'B'))
  ) {
    return 'A-and-B mandate needs an active Class A and an active Class B signatory';
  }
  return null;
}

function nuban(prefix: string): string {
  const db = getDb();
  let n = nextCounter(db, `nuban:${prefix}`);
  let no = '';
  do {
    no = `${prefix}${String((n * 7_919_573) % 100_000_000).padStart(8, '0')}`;
    n += 1;
  } while (db.accounts.some((a) => a.accountNo === no));
  return no;
}

export const mockCustomersService: CustomersService = {
  list: (q = {}) =>
    run(() => {
      const db = getDb();
      const f = q.filters ?? {};
      const rows: CustomerRow[] = db.customers
        .filter(
          (c) =>
            matchesSearch(f.search, c.customerName, c.cifNo, c.email, c.regPhone) &&
            (!f.customerType || c.customerType === f.customerType) &&
            (!f.status || c.status === f.status) &&
            (!f.accountOfficerId || c.accountOfficerId === f.accountOfficerId) &&
            (f.whtExempt === undefined || c.whtExempt === f.whtExempt)
        )
        .map((c) => {
          const invs = db.investments.filter((i) => i.customerId === c.id);
          return {
            ...c,
            officerName: findById(db, 'users', c.accountOfficerId)?.fullName ?? '—',
            activeInvestments: invs.filter((i) => i.status === 'ACTIVE' || i.status === 'MATURED')
              .length,
            aum: aumOf(invs),
          };
        });
      return paginate(rows, { sort: { field: 'cifNo', dir: 'asc' }, ...q });
    }),

  get: (id) =>
    run(() => {
      const db = getDb();
      const customer = getById(db, 'customers', id, 'customer');
      const investments = db.investments.filter((i) => i.customerId === id);
      return {
        customer,
        officer: findById(db, 'users', customer.accountOfficerId) ?? null,
        signatories: db.signatories.filter((s) => s.customerId === id),
        mandate: db.mandates.find((m) => m.customerId === id) ?? null,
        accounts: db.accounts.filter((a) => a.customerId === id),
        investments,
        beneficiaries: db.beneficiaries.filter((b) => b.customerId === id),
        aum: aumOf(investments),
      };
    }),

  create: (input) =>
    run(() => {
      const c = ctx([...EDITORS]);
      validate(input, true);
      if (!input.firstSignatory?.fullName?.trim())
        fieldErrors({ signatoryName: 'First signatory name is required' });
      return mutate((db) => {
        const last = db.customers.reduce((m, x) => Math.max(m, Number(x.cifNo.slice(3))), 100);
        const cust = auditedInsert(
          db,
          c,
          'customers',
          {
            cifNo: `FMT${String(last + 1).padStart(6, '0')}`,
            customerName: input.customerName.trim(),
            customerType: input.customerType,
            regPhone: normalisePhone(input.regPhone)!,
            email: input.email.trim(),
            address: input.address.trim(),
            bvnMasked: maskBvn(input.bvn!),
            whtExempt: input.whtExempt,
            accountOfficerId: input.accountOfficerId,
            status: 'ACTIVE',
            createdAt: c.at,
          },
          'Customer',
          (x) => `Customer ${x.cifNo} ${x.customerName} created`
        );
        const name = input.firstSignatory.fullName.trim();
        auditedInsert(
          db,
          c,
          'signatories',
          {
            customerId: cust.id,
            fullName: name,
            signClass: input.firstSignatory.signClass,
            specimenSvg: specimenSvg(name, createRng(name.length * 131 + 7)),
            active: true,
          },
          'Signatory',
          () => `Signatory ${name} added to ${cust.cifNo}`
        );
        auditedInsert(
          db,
          c,
          'mandates',
          { customerId: cust.id, ruleCode: 'SOLE', effectiveDate: isoDatePart(c.at) },
          'Mandate',
          () => `Mandate set to SOLE for ${cust.cifNo}`
        );
        for (const productCode of ['SS', 'PA'] as const) {
          auditedInsert(
            db,
            c,
            'accounts',
            {
              customerId: cust.id,
              accountNo: nuban(productCode === 'PA' ? '10' : '20'),
              accountName: cust.customerName,
              productCode,
              ledgerBal: ZERO,
              availableBal: ZERO,
              status: 'ACTIVE',
              openedDate: isoDatePart(c.at),
            },
            'Account',
            (a) => `${productCode} account ${a.accountNo} opened for ${cust.cifNo}`
          );
        }
        return cust;
      });
    }),

  update: (id, input, version) =>
    run(() => {
      const c = ctx([...EDITORS]);
      validate(input, false);
      return mutate((db) => {
        const patch: Partial<Customer> = {
          customerName: input.customerName.trim(),
          customerType: input.customerType,
          regPhone: normalisePhone(input.regPhone)!,
          email: input.email.trim(),
          address: input.address.trim(),
          whtExempt: input.whtExempt,
          accountOfficerId: input.accountOfficerId,
        };
        if (input.bvn) patch.bvnMasked = maskBvn(input.bvn);
        const cust = auditedUpdate(
          db,
          c,
          'customers',
          id,
          patch,
          version,
          'Customer',
          (x) => `Customer ${x.cifNo} updated`
        );
        for (const a of db.accounts.filter((x) => x.customerId === id))
          a.accountName = cust.customerName;
        return cust;
      });
    }),

  setStatus: (id, status, version) =>
    run(() => {
      const c = ctx([...EDITORS]);
      const db = getDb();
      if (status === 'INACTIVE') {
        const active = db.investments.filter(
          (i) => i.customerId === id && (i.status === 'ACTIVE' || i.status === 'MATURED')
        ).length;
        if (active)
          throw new AppError(
            `Cannot deactivate: the customer has ${active} active investment${active === 1 ? '' : 's'}.`,
            'VALIDATION'
          );
        if (db.txns.some((t) => t.customerId === id && LOCKING_STATUSES.includes(t.status))) {
          throw new AppError(
            'Cannot deactivate: the customer has transactions in progress.',
            'VALIDATION'
          );
        }
      }
      return mutate((d) =>
        auditedUpdate(
          d,
          c,
          'customers',
          id,
          { status },
          version,
          'Customer',
          (x) => `Customer ${x.cifNo} ${status === 'ACTIVE' ? 'reactivated' : 'deactivated'}`,
          status === 'ACTIVE' ? 'REACTIVATE' : 'DEACTIVATE'
        )
      );
    }),

  addSignatory: (customerId, input) =>
    run(() => {
      const c = ctx([...EDITORS]);
      const cust = getById(getDb(), 'customers', customerId, 'customer');
      if (!input.fullName?.trim()) fieldErrors({ fullName: 'Full name is required' });
      const name = input.fullName.trim();
      return mutate((db) =>
        auditedInsert(
          db,
          c,
          'signatories',
          {
            customerId,
            fullName: name,
            signClass: input.signClass,
            specimenSvg: specimenSvg(name, createRng(name.length * 131 + db.signatories.length)),
            active: input.active ?? true,
          },
          'Signatory',
          () => `Signatory ${name} (Class ${input.signClass}) added to ${cust.cifNo}`
        )
      );
    }),

  updateSignatory: (id, input, version) =>
    run(() => {
      const c = ctx([...EDITORS]);
      const db = getDb();
      const sig = getById(db, 'signatories', id, 'signatory');
      if (!input.fullName?.trim()) fieldErrors({ fullName: 'Full name is required' });
      const after = db.signatories
        .map((s) =>
          s.id === id ? { ...s, signClass: input.signClass, active: input.active ?? s.active } : s
        )
        .filter((s) => s.customerId === sig.customerId);
      const mandate = db.mandates.find((m) => m.customerId === sig.customerId);
      const problem = mandate ? mandateProblem(mandate.ruleCode, after) : null;
      if (problem) throw new AppError(`${problem}. Change the mandate first.`, 'VALIDATION');
      return mutate((d) =>
        auditedUpdate(
          d,
          c,
          'signatories',
          id,
          {
            fullName: input.fullName.trim(),
            signClass: input.signClass,
            active: input.active ?? sig.active,
          },
          version,
          'Signatory',
          (s) => `Signatory ${s.fullName} updated`
        )
      );
    }),

  removeSignatory: (id, version) =>
    run(() => {
      const c = ctx([...EDITORS]);
      const db = getDb();
      const sig = getById(db, 'signatories', id, 'signatory');
      const rest = db.signatories.filter((s) => s.customerId === sig.customerId && s.id !== id);
      if (!rest.some((s) => s.active))
        throw new AppError('Keep at least one active signatory.', 'VALIDATION');
      const mandate = db.mandates.find((m) => m.customerId === sig.customerId);
      const problem = mandate ? mandateProblem(mandate.ruleCode, rest) : null;
      if (problem) throw new AppError(`${problem}. Change the mandate first.`, 'VALIDATION');
      mutate((d) =>
        auditedRemove(
          d,
          c,
          'signatories',
          id,
          version,
          'Signatory',
          (s) => `Signatory ${s.fullName} removed`
        )
      );
    }),

  setMandate: (customerId, ruleCode) =>
    run(() => {
      const c = ctx([...EDITORS]);
      const db = getDb();
      getById(db, 'customers', customerId, 'customer');
      const problem = mandateProblem(
        ruleCode,
        db.signatories.filter((s) => s.customerId === customerId)
      );
      if (problem) throw new AppError(problem, 'VALIDATION', { ruleCode: problem });
      return mutate((d) => {
        const m = d.mandates.find((x) => x.customerId === customerId);
        const summary = () => `Mandate changed to "${MANDATE_RULE_LABELS[ruleCode]}"`;
        if (m)
          return auditedUpdate(
            d,
            c,
            'mandates',
            m.id,
            { ruleCode, effectiveDate: isoDatePart(c.at) },
            undefined,
            'Mandate',
            summary
          );
        return auditedInsert(
          d,
          c,
          'mandates',
          { customerId, ruleCode, effectiveDate: isoDatePart(c.at) },
          'Mandate',
          summary
        );
      });
    }),
};

export const httpCustomersService: CustomersService = {
  list: (q) => http.get('/customers', q as Record<string, unknown>),
  get: (id) => http.get(`/customers/${id}`),
  create: (input) => http.post('/customers', input),
  update: (id, input, version) => http.put(`/customers/${id}`, { ...input, version }),
  setStatus: (id, status, version) => http.patch(`/customers/${id}/status`, { status, version }),
  addSignatory: (customerId, input) => http.post(`/customers/${customerId}/signatories`, input),
  updateSignatory: (id, input, version) => http.put(`/signatories/${id}`, { ...input, version }),
  removeSignatory: (id, version) => http.del(`/signatories/${id}`, { version }),
  setMandate: (customerId, ruleCode) => http.put(`/customers/${customerId}/mandate`, { ruleCode }),
};

export const customersService: CustomersService = USE_MOCK
  ? mockCustomersService
  : httpCustomersService;
