import type { Bank, ListQuery, ListResult } from '@/domain/types';
import { getDb, mutate } from '@/data/store';
import { getById, matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, run } from './core';
import { auditedInsert, auditedUpdate, fieldErrors } from './crud';

export interface BankFilters {
  search?: string;
  active?: boolean;
}

export type BankInput = Pick<Bank, 'bankCode' | 'bankName' | 'shortName'>;

export interface BanksService {
  list(q?: ListQuery<BankFilters>): Promise<ListResult<Bank>>;
  get(id: string): Promise<Bank>;
  create(input: BankInput): Promise<Bank>;
  update(id: string, input: BankInput, version: number): Promise<Bank>;
  setActive(id: string, active: boolean, version: number): Promise<Bank>;
}

function validate(input: BankInput, selfId?: string) {
  const errors: Record<string, string> = {};
  if (!/^\d{3}$/.test(input.bankCode ?? '')) errors.bankCode = 'CBN code must be 3 digits';
  else if (getDb().banks.some((b) => b.id !== selfId && b.bankCode === input.bankCode))
    errors.bankCode = 'Another bank has this code';
  if (!input.bankName?.trim()) errors.bankName = 'Bank name is required';
  if (!input.shortName?.trim()) errors.shortName = 'Short name is required';
  fieldErrors(errors);
}

export const mockBanksService: BanksService = {
  list: (q = {}) =>
    run(() => {
      const f = q.filters ?? {};
      const rows = getDb().banks.filter(
        (b) =>
          matchesSearch(f.search, b.bankName, b.shortName, b.bankCode) &&
          (f.active === undefined || b.active === f.active)
      );
      return paginate(rows, { sort: { field: 'bankName', dir: 'asc' }, ...q });
    }),
  get: (id) => run(() => getById(getDb(), 'banks', id, 'bank')),
  create: (input) =>
    run(() => {
      const c = ctx(['ADM']);
      validate(input);
      return mutate((db) =>
        auditedInsert(
          db,
          c,
          'banks',
          {
            ...input,
            bankName: input.bankName.trim(),
            shortName: input.shortName.trim(),
            active: true,
          },
          'Bank',
          (b) => `Bank ${b.bankCode} ${b.bankName} added`
        )
      );
    }),
  update: (id, input, version) =>
    run(() => {
      const c = ctx(['ADM']);
      validate(input, id);
      return mutate((db) =>
        auditedUpdate(
          db,
          c,
          'banks',
          id,
          input,
          version,
          'Bank',
          (b) => `Bank ${b.bankCode} ${b.bankName} updated`
        )
      );
    }),
  setActive: (id, active, version) =>
    run(() => {
      const c = ctx(['ADM']);
      return mutate((db) =>
        auditedUpdate(
          db,
          c,
          'banks',
          id,
          { active },
          version,
          'Bank',
          (b) => `Bank ${b.bankName} ${active ? 'reactivated' : 'deactivated'}`,
          active ? 'REACTIVATE' : 'DEACTIVATE'
        )
      );
    }),
};

export const httpBanksService: BanksService = {
  list: (q) => http.get('/banks', q as Record<string, unknown>),
  get: (id) => http.get(`/banks/${id}`),
  create: (input) => http.post('/banks', input),
  update: (id, input, version) => http.put(`/banks/${id}`, { ...input, version }),
  setActive: (id, active, version) => http.patch(`/banks/${id}/active`, { active, version }),
};

export const banksService: BanksService = USE_MOCK ? mockBanksService : httpBanksService;
