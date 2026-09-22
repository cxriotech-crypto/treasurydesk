/** Generic table helpers used by the workflow engine and the mock services. */
import type { BaseRecord, ListQuery, ListResult } from '@/domain/types';
import type { Db, RowOf, TableName } from './db';

export class AppError extends Error {
  constructor(
    message: string,
    public code: 'VALIDATION' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'STATE' = 'VALIDATION',
    public fieldErrors: Record<string, string> = {}
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ConcurrencyError extends AppError {
  constructor(entity: string) {
    super(
      `This ${entity} was changed by someone else. Reload to see the latest version and try again.`,
      'CONFLICT'
    );
    this.name = 'ConcurrencyError';
  }
}

const ID_PREFIX: Record<TableName, string> = {
  users: 'USR',
  banks: 'BNK',
  customers: 'CUS',
  signatories: 'SIG',
  mandates: 'MAN',
  accounts: 'ACC',
  investments: 'INV',
  beneficiaries: 'BEN',
  txns: 'TXN',
  instructions: 'INS',
  verifications: 'VER',
  callbacks: 'CBL',
  vouchers: 'VCH',
  approvals: 'APR',
  executions: 'EXE',
  controls: 'CTL',
  comments: 'CMT',
  notifications: 'NTF',
  audit: 'AUD',
  holidays: 'HOL',
  integrations: 'INT',
};

export function nextCounter(db: Db, key: string): number {
  const n = (db.counters[key] ?? 0) + 1;
  db.counters[key] = n;
  return n;
}

export function newId(db: Db, table: TableName): string {
  return `${ID_PREFIX[table]}-${String(nextCounter(db, `id:${table}`)).padStart(6, '0')}`;
}

export function insert<T extends TableName>(
  db: Db,
  table: T,
  row: Omit<RowOf<T>, 'id' | 'version'>
): RowOf<T> {
  const rec = { ...(row as object), id: newId(db, table), version: 1 } as RowOf<T>;
  (db[table] as unknown as RowOf<T>[]).push(rec);
  return rec;
}

export function findById<T extends TableName>(
  db: Db,
  table: T,
  id: string | null | undefined
): RowOf<T> | undefined {
  if (!id) return undefined;
  return (db[table] as unknown as RowOf<T>[]).find((r) => (r as BaseRecord).id === id);
}

export function getById<T extends TableName>(
  db: Db,
  table: T,
  id: string | null | undefined,
  label = 'record'
): RowOf<T> {
  const r = findById(db, table, id);
  if (!r) throw new AppError(`The ${label} could not be found.`, 'NOT_FOUND');
  return r;
}

/**
 * Update a row in place. When expectedVersion is given it must match (optimistic concurrency).
 * Returns { before, after } snapshots of the changed fields for the audit trail.
 */
export function update<T extends TableName>(
  db: Db,
  table: T,
  id: string,
  patch: Partial<RowOf<T>>,
  expectedVersion?: number,
  label = 'record'
): { row: RowOf<T>; before: Record<string, unknown>; after: Record<string, unknown> } {
  const row = getById(db, table, id, label) as RowOf<T> & BaseRecord;
  if (expectedVersion !== undefined && row.version !== expectedVersion)
    throw new ConcurrencyError(label);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const cur = (row as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(cur) !== JSON.stringify(v)) {
      before[k] = cur ?? null;
      after[k] = v ?? null;
    }
  }
  Object.assign(row, patch);
  row.version += 1;
  return { row, before, after };
}

export function remove<T extends TableName>(
  db: Db,
  table: T,
  id: string,
  expectedVersion?: number,
  label = 'record'
): RowOf<T> {
  const rows = db[table] as unknown as (RowOf<T> & BaseRecord)[];
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) throw new AppError(`The ${label} could not be found.`, 'NOT_FOUND');
  if (expectedVersion !== undefined && rows[idx].version !== expectedVersion)
    throw new ConcurrencyError(label);
  const [r] = rows.splice(idx, 1);
  return r;
}

function getField(row: unknown, field: string): unknown {
  return field
    .split('.')
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), row);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const sa = String(a);
  const sb = String(b);
  // Money / numeric strings sort numerically.
  if (/^-?\d+(\.\d+)?$/.test(sa) && /^-?\d+(\.\d+)?$/.test(sb)) return Number(sa) - Number(sb);
  return sa.localeCompare(sb);
}

/** Sort + page an already-filtered array → { items, total } (maps to ORDER BY … OFFSET … FETCH NEXT). */
export function paginate<T>(rows: T[], query: ListQuery<unknown> = {}): ListResult<T> {
  let out = rows;
  if (query.sort) {
    const { field, dir } = query.sort;
    const m = dir === 'desc' ? -1 : 1;
    out = [...rows].sort((a, b) => m * compareValues(getField(a, field), getField(b, field)));
  }
  const total = out.length;
  const pageSize = query.pageSize ?? total;
  const page = Math.max(1, query.page ?? 1);
  const start = (page - 1) * pageSize;
  return { items: pageSize > 0 ? out.slice(start, start + pageSize) : [], total };
}

export function matchesSearch(
  q: string | undefined,
  ...fields: (string | null | undefined)[]
): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => f && f.toLowerCase().includes(needle));
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
