import type { Account, ListQuery, ListResult } from '@/domain/types';
import {
  ACCOUNT_PRODUCT_LABELS,
  type AccountProductCode,
  type RecordStatus,
  type ScenarioCode,
} from '@/domain/codes';
import { accountIneligibility } from '@/domain/rules';
import { isoDatePart } from '@/lib/dates';
import { formatNaira } from '@/lib/format';
import { isValidMoney, isZero, lt, toMoney } from '@/lib/money';
import { getDb, mutate } from '@/data/store';
import { AppError, findById, getById, matchesSearch, nextCounter, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, run } from './core';
import { auditedInsert, auditedUpdate, fieldErrors } from './crud';

export interface AccountFilters {
  search?: string;
  customerId?: string;
  productCode?: AccountProductCode;
  status?: RecordStatus;
}

export interface AccountRow extends Account {
  cifNo: string;
  customerName: string;
}

export interface AccountLookup {
  accountId: string;
  accountNo: string;
  accountName: string;
  productCode: AccountProductCode;
  customerId: string;
}

export interface AccountsService {
  list(q?: ListQuery<AccountFilters>): Promise<ListResult<AccountRow>>;
  get(id: string): Promise<AccountRow>;
  /** Internal name enquiry by account number (null when not found). */
  lookup(accountNo: string): Promise<AccountLookup | null>;
  /** A customer's accounts for a scenario (wizard step 1), each with the reason if not eligible. */
  forScenario(
    scenario: ScenarioCode,
    customerId: string
  ): Promise<(AccountRow & { disabledReason: string | null })[]>;
  create(
    customerId: string,
    productCode: AccountProductCode,
    openingBalance: string
  ): Promise<Account>;
  setStatus(id: string, status: RecordStatus, version: number): Promise<Account>;
}

function toRow(a: Account): AccountRow {
  const c = findById(getDb(), 'customers', a.customerId);
  return { ...a, cifNo: c?.cifNo ?? '', customerName: c?.customerName ?? '' };
}

export const mockAccountsService: AccountsService = {
  forScenario: (scenario, customerId) =>
    run(() =>
      getDb()
        .accounts.filter((a) => a.customerId === customerId)
        .map((a) => ({ ...toRow(a), disabledReason: accountIneligibility(scenario, a) }))
        .sort((a, b) => Number(!!a.disabledReason) - Number(!!b.disabledReason))
    ),
  list: (q = {}) =>
    run(() => {
      const f = q.filters ?? {};
      const rows = getDb()
        .accounts.filter(
          (a) =>
            (!f.customerId || a.customerId === f.customerId) &&
            (!f.productCode || a.productCode === f.productCode) &&
            (!f.status || a.status === f.status)
        )
        .map(toRow)
        .filter((a) => matchesSearch(f.search, a.accountNo, a.accountName, a.cifNo));
      return paginate(rows, { sort: { field: 'accountNo', dir: 'asc' }, ...q });
    }),
  get: (id) => run(() => toRow(getById(getDb(), 'accounts', id, 'account'))),
  lookup: (accountNo) =>
    run(() => {
      const a = getDb().accounts.find((x) => x.accountNo === accountNo.trim());
      return a
        ? {
            accountId: a.id,
            accountNo: a.accountNo,
            accountName: a.accountName,
            productCode: a.productCode,
            customerId: a.customerId,
          }
        : null;
    }, 600),
  create: (customerId, productCode, openingBalance) =>
    run(() => {
      const c = ctx(['ADM']);
      const db = getDb();
      const cust = getById(db, 'customers', customerId, 'customer');
      const e: Record<string, string> = {};
      if (!['SS', 'PA'].includes(productCode)) e.productCode = 'Choose SS or PA';
      if (!isValidMoney(openingBalance) || lt(openingBalance, 0))
        e.openingBalance = 'Enter an amount of zero or more';
      fieldErrors(e);
      return mutate((d) => {
        let n = nextCounter(d, `nuban:${productCode}`);
        let no = '';
        do {
          no = `${productCode === 'PA' ? '10' : '20'}${String((n * 7_919_573) % 100_000_000).padStart(8, '0')}`;
          n += 1;
        } while (d.accounts.some((a) => a.accountNo === no));
        const bal = toMoney(openingBalance);
        return auditedInsert(
          d,
          c,
          'accounts',
          {
            customerId,
            accountNo: no,
            accountName: cust.customerName,
            productCode,
            ledgerBal: bal,
            availableBal: bal,
            status: 'ACTIVE',
            openedDate: isoDatePart(c.at),
          },
          'Account',
          (a) =>
            `${ACCOUNT_PRODUCT_LABELS[productCode]} ${a.accountNo} opened for ${cust.cifNo} with ${formatNaira(bal)}`
        );
      });
    }),
  setStatus: (id, status, version) =>
    run(() => {
      const c = ctx(['ADM']);
      const a = getById(getDb(), 'accounts', id, 'account');
      if (status === 'INACTIVE' && !(isZero(a.ledgerBal) && isZero(a.availableBal))) {
        throw new AppError(
          `Only zero-balance accounts can be deactivated (balance ${formatNaira(a.ledgerBal)}).`,
          'VALIDATION'
        );
      }
      return mutate((d) =>
        auditedUpdate(
          d,
          c,
          'accounts',
          id,
          { status },
          version,
          'Account',
          (x) => `Account ${x.accountNo} ${status === 'ACTIVE' ? 'reactivated' : 'deactivated'}`,
          status === 'ACTIVE' ? 'REACTIVATE' : 'DEACTIVATE'
        )
      );
    }),
};

export const httpAccountsService: AccountsService = {
  forScenario: (scenario, customerId) => http.get('/accounts/eligible', { scenario, customerId }),
  list: (q) => http.get('/accounts', q as Record<string, unknown>),
  get: (id) => http.get(`/accounts/${id}`),
  lookup: (accountNo) => http.get('/accounts/lookup', { accountNo }),
  create: (customerId, productCode, openingBalance) =>
    http.post('/accounts', { customerId, productCode, openingBalance }),
  setStatus: (id, status, version) => http.patch(`/accounts/${id}/status`, { status, version }),
};

export const accountsService: AccountsService = USE_MOCK
  ? mockAccountsService
  : httpAccountsService;
