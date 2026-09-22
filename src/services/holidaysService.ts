import type { ListQuery, ListResult, PublicHoliday } from '@/domain/types';
import { isIsoDate } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { getDb, mutate } from '@/data/store';
import { getById, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, run } from './core';
import { auditedInsert, auditedRemove, auditedUpdate, fieldErrors } from './crud';

export interface HolidayFilters {
  year?: number;
}

export type HolidayInput = Pick<PublicHoliday, 'holidayDate' | 'description'>;

export interface HolidaysService {
  list(q?: ListQuery<HolidayFilters>): Promise<ListResult<PublicHoliday>>;
  /** All holiday dates (used by calculations). */
  dates(): Promise<string[]>;
  create(input: HolidayInput): Promise<PublicHoliday>;
  update(id: string, input: HolidayInput, version: number): Promise<PublicHoliday>;
  remove(id: string, version: number): Promise<void>;
}

function validate(input: HolidayInput, selfId?: string) {
  const errors: Record<string, string> = {};
  if (!isIsoDate(input.holidayDate)) errors.holidayDate = 'Choose a date';
  else if (getDb().holidays.some((h) => h.id !== selfId && h.holidayDate === input.holidayDate))
    errors.holidayDate = 'This date is already a holiday';
  if (!input.description?.trim()) errors.description = 'Description is required';
  fieldErrors(errors);
}

export const mockHolidaysService: HolidaysService = {
  list: (q = {}) =>
    run(() => {
      const f = q.filters ?? {};
      const rows = getDb().holidays.filter(
        (h) => !f.year || h.holidayDate.startsWith(String(f.year))
      );
      return paginate(rows, { sort: { field: 'holidayDate', dir: 'asc' }, ...q });
    }),
  dates: () => run(() => getDb().holidays.map((h) => h.holidayDate)),
  create: (input) =>
    run(() => {
      const c = ctx(['ADM']);
      validate(input);
      return mutate((db) =>
        auditedInsert(
          db,
          c,
          'holidays',
          { holidayDate: input.holidayDate, description: input.description.trim() },
          'PublicHoliday',
          (h) => `Holiday ${formatDate(h.holidayDate)} (${h.description}) added`
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
          'holidays',
          id,
          { holidayDate: input.holidayDate, description: input.description.trim() },
          version,
          'PublicHoliday',
          (h) => `Holiday ${formatDate(h.holidayDate)} updated`
        )
      );
    }),
  remove: (id, version) =>
    run(() => {
      const c = ctx(['ADM']);
      getById(getDb(), 'holidays', id, 'holiday');
      mutate((db) =>
        auditedRemove(
          db,
          c,
          'holidays',
          id,
          version,
          'PublicHoliday',
          (h) => `Holiday ${formatDate(h.holidayDate)} (${h.description}) removed`
        )
      );
    }),
};

export const httpHolidaysService: HolidaysService = {
  list: (q) => http.get('/holidays', q as Record<string, unknown>),
  dates: () => http.get('/holidays/dates'),
  create: (input) => http.post('/holidays', input),
  update: (id, input, version) => http.put(`/holidays/${id}`, { ...input, version }),
  remove: (id, version) => http.del(`/holidays/${id}`, { version }),
};

export const holidaysService: HolidaysService = USE_MOCK
  ? mockHolidaysService
  : httpHolidaysService;
