import type {
  Customer, Signatory, Mandate, Account, Beneficiary, CallbackLog,
  ListParams, ListResult,
} from '@/types';
import {
  SEED_CUSTOMERS, SEED_SIGNATORIES, SEED_MANDATES,
  SEED_ACCOUNTS, SEED_BENEFICIARIES, SEED_CALLBACK_LOGS, SEED_BANKS,
} from './seedData';
import { nowLagosISO } from '@/lib/format';

const DELAY = 300;

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

// ─── Generic localStorage store ───────────────────────────────────────────────
function makeStore<T>(key: string, seed: T[]) {
  function load(): T[] {
    if (typeof window === 'undefined') return JSON.parse(JSON.stringify(seed));
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(seed));
    } catch {
      return JSON.parse(JSON.stringify(seed));
    }
  }
  function save(data: T[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(data));
  }
  function reset() {
    save(JSON.parse(JSON.stringify(seed)));
  }
  return { load, save, reset };
}

const custStore = makeStore<Customer>('td_customers', SEED_CUSTOMERS);
const sigStore = makeStore<Signatory>('td_signatories', SEED_SIGNATORIES);
const mndStore = makeStore<Mandate>('td_mandates', SEED_MANDATES);
const accStore = makeStore<Account>('td_accounts', SEED_ACCOUNTS);
const benStore = makeStore<Beneficiary>('td_beneficiaries', SEED_BENEFICIARIES);
const cbStore = makeStore<CallbackLog>('td_callbacks', SEED_CALLBACK_LOGS);

export function resetCustomers() {
  custStore.reset();
  sigStore.reset();
  mndStore.reset();
  accStore.reset();
  benStore.reset();
  cbStore.reset();
}

// ─── Banks (read-only from seed) ──────────────────────────────────────────────
export async function getBanks() {
  await delay(100);
  return SEED_BANKS.filter((b) => b.isActive);
}

// ─── Customer Service ─────────────────────────────────────────────────────────
export interface CustomerService {
  list(params: ListParams): Promise<ListResult<Customer>>;
  getById(id: string): Promise<Customer | null>;
  create(c: Omit<Customer, 'id' | 'version' | 'createdAt'>): Promise<Customer>;
  update(id: string, patch: Partial<Customer>): Promise<Customer>;

  getSignatories(customerId: string): Promise<Signatory[]>;
  getMandate(customerId: string): Promise<Mandate | null>;
  getAccounts(customerId: string): Promise<Account[]>;

  getBeneficiaries(customerId: string): Promise<Beneficiary[]>;
  addBeneficiary(b: Omit<Beneficiary, 'id' | 'version' | 'createdAt'>): Promise<Beneficiary>;
  updateBeneficiary(id: string, patch: Partial<Beneficiary>): Promise<Beneficiary>;
  deleteBeneficiary(id: string): Promise<void>;

  getCallbackLogs(customerId: string): Promise<CallbackLog[]>;
  addCallbackLog(log: Omit<CallbackLog, 'id' | 'version'>): Promise<CallbackLog>;

  enquireAccountName(accountNumber: string, bankId: string): Promise<string>;
}

export const customerService: CustomerService = {
  async list({ page = 1, pageSize = 20, sort, filters }: ListParams) {
    await delay(DELAY);
    let items = custStore.load();

    if (filters) {
      if (filters.search && typeof filters.search === 'string') {
        const q = filters.search.toLowerCase();
        items = items.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.cif.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            c.email.toLowerCase().includes(q)
        );
      }
      if (filters.customerType) {
        items = items.filter((c) => c.customerType === filters.customerType);
      }
      if (filters.accountOfficerId) {
        items = items.filter((c) => c.accountOfficerId === filters.accountOfficerId);
      }
      if (filters.isWhtExempt !== undefined) {
        const exempt = filters.isWhtExempt === 'true';
        items = items.filter((c) => c.isWhtExempt === exempt);
      }
    }

    if (sort) {
      items = [...items].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sort.field];
        const bv = (b as Record<string, unknown>)[sort.field];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    } else {
      items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total };
  },

  async getById(id: string) {
    await delay(DELAY);
    return custStore.load().find((c) => c.id === id) ?? null;
  },

  async create(c) {
    await delay(DELAY);
    const all = custStore.load();
    const maxCif = all.reduce((max, x) => {
      const n = parseInt(x.cif.replace('FMT', ''), 10);
      return n > max ? n : max;
    }, 100);
    const newCust: Customer = {
      ...c,
      id: `cust-${Date.now()}`,
      version: 1,
      cif: `FMT${String(maxCif + 1).padStart(6, '0')}`,
      createdAt: nowLagosISO(),
    };
    all.unshift(newCust);
    custStore.save(all);
    return newCust;
  },

  async update(id: string, patch: Partial<Customer>) {
    await delay(DELAY);
    const all = custStore.load();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Customer ${id} not found`);
    const updated = { ...all[idx], ...patch, version: all[idx].version + 1 };
    all[idx] = updated;
    custStore.save(all);
    return updated;
  },

  async getSignatories(customerId: string) {
    await delay(DELAY);
    return sigStore.load().filter((s) => s.customerId === customerId && s.isActive);
  },

  async getMandate(customerId: string) {
    await delay(DELAY);
    return mndStore.load().find((m) => m.customerId === customerId && m.isActive) ?? null;
  },

  async getAccounts(customerId: string) {
    await delay(DELAY);
    return accStore.load().filter((a) => a.customerId === customerId && a.isActive);
  },

  async getBeneficiaries(customerId: string) {
    await delay(DELAY);
    return benStore.load().filter((b) => b.customerId === customerId && b.isActive);
  },

  async addBeneficiary(b) {
    await delay(DELAY);
    const all = benStore.load();
    const newBen: Beneficiary = {
      ...b,
      id: `ben-${Date.now()}`,
      version: 1,
      createdAt: nowLagosISO(),
    };
    all.unshift(newBen);
    benStore.save(all);
    return newBen;
  },

  async updateBeneficiary(id: string, patch: Partial<Beneficiary>) {
    await delay(DELAY);
    const all = benStore.load();
    const idx = all.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error(`Beneficiary ${id} not found`);
    const updated = { ...all[idx], ...patch, version: all[idx].version + 1 };
    all[idx] = updated;
    benStore.save(all);
    return updated;
  },

  async deleteBeneficiary(id: string) {
    await delay(DELAY);
    const all = benStore.load();
    const idx = all.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error(`Beneficiary ${id} not found`);
    all[idx] = { ...all[idx], isActive: false };
    benStore.save(all);
  },

  async getCallbackLogs(customerId: string) {
    await delay(DELAY);
    return cbStore.load().filter((c) => c.customerId === customerId);
  },

  async addCallbackLog(log) {
    await delay(DELAY);
    const all = cbStore.load();
    const newLog: CallbackLog = {
      ...log,
      id: `cb-${Date.now()}`,
      version: 1,
    };
    all.unshift(newLog);
    cbStore.save(all);
    return newLog;
  },

  async enquireAccountName(accountNumber: string, _bankId: string) {
    await delay(1000); // simulate 1s network call
    // Simulated name enquiry — return a plausible name based on account number
    const names = [
      'CHUKWUEMEKA OBI', 'NGOZI ADEYEMI', 'BABATUNDE FASHOLA', 'AMINA BELLO',
      'EMEKA EZE', 'FATIMA USMAN', 'OLUWASEUN ADESANYA', 'CHIDINMA OKAFOR',
      'MUSA IBRAHIM', 'ADAORA NWOSU', 'TUNDE OGUNDIMU', 'KEMI ADEBAYO',
    ];
    const idx = parseInt(accountNumber.slice(-2), 10) % names.length;
    return names[idx];
  },
};
