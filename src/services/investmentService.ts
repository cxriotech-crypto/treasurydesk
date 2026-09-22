import type { Investment, ListParams, ListResult } from '@/types';
import { SEED_INVESTMENTS } from './seedData';


const STORAGE_KEY = 'td_investments';
const DELAY = 300;

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

function load(): Investment[] {
  if (typeof window === 'undefined') return JSON.parse(JSON.stringify(SEED_INVESTMENTS));
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(SEED_INVESTMENTS));
  } catch {
    return JSON.parse(JSON.stringify(SEED_INVESTMENTS));
  }
}

function save(data: Investment[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetInvestments() {
  save(JSON.parse(JSON.stringify(SEED_INVESTMENTS)));
}

export interface InvestmentService {
  list(params: ListParams): Promise<ListResult<Investment>>;
  getById(id: string): Promise<Investment | null>;
  getByCustomerId(customerId: string): Promise<Investment[]>;
  create(inv: Omit<Investment, 'id' | 'version'>): Promise<Investment>;
  update(id: string, patch: Partial<Investment>): Promise<Investment>;
}

export const investmentService: InvestmentService = {
  async list({ page = 1, pageSize = 20, sort, filters }: ListParams) {
    await delay(DELAY);
    let items = load();

    if (filters) {
      if (filters.product) {
        const products = Array.isArray(filters.product) ? filters.product : [filters.product];
        items = items.filter((i) => products.includes(i.product));
      }
      if (filters.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        items = items.filter((i) => statuses.includes(i.status));
      }
      if (filters.customerId) {
        items = items.filter((i) => i.customerId === filters.customerId);
      }
      if (filters.customerName && typeof filters.customerName === 'string') {
        const q = filters.customerName.toLowerCase();
        items = items.filter(
          (i) =>
            i.customerName.toLowerCase().includes(q) ||
            i.customerCif.toLowerCase().includes(q)
        );
      }
      if (filters.search && typeof filters.search === 'string') {
        const q = filters.search.toLowerCase();
        items = items.filter(
          (i) =>
            i.cbsRef.toLowerCase().includes(q) ||
            i.customerName.toLowerCase().includes(q) ||
            i.customerCif.toLowerCase().includes(q)
        );
      }
      if (filters.maturityFrom && typeof filters.maturityFrom === 'string') {
        items = items.filter((i) => i.maturityDate >= (filters.maturityFrom as string));
      }
      if (filters.maturityTo && typeof filters.maturityTo === 'string') {
        items = items.filter((i) => i.maturityDate <= (filters.maturityTo as string));
      }
      if (filters.principalMin && typeof filters.principalMin === 'string') {
        const min = parseFloat(filters.principalMin);
        items = items.filter((i) => parseFloat(i.principalAmt) >= min);
      }
      if (filters.principalMax && typeof filters.principalMax === 'string') {
        const max = parseFloat(filters.principalMax);
        items = items.filter((i) => parseFloat(i.principalAmt) <= max);
      }
    }

    if (sort) {
      items = [...items].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sort.field];
        const bv = (b as Record<string, unknown>)[sort.field];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
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
    return load().find((i) => i.id === id) ?? null;
  },

  async getByCustomerId(customerId: string) {
    await delay(DELAY);
    return load().filter((i) => i.customerId === customerId);
  },

  async create(inv) {
    await delay(DELAY);
    const all = load();
    const newInv: Investment = {
      ...inv,
      id: `inv-${Date.now()}`,
      version: 1,
    };
    all.unshift(newInv);
    save(all);
    return newInv;
  },

  async update(id: string, patch: Partial<Investment>) {
    await delay(DELAY);
    const all = load();
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error(`Investment ${id} not found`);
    const updated = { ...all[idx], ...patch, version: all[idx].version + 1 };
    all[idx] = updated;
    save(all);
    return updated;
  },
};
