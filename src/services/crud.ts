/** Audited create / update / delete for reference data (mock implementations). */
import type { Ctx } from '@/domain/types';
import type { Db, RowOf, TableName } from '@/data/db';
import { writeAudit } from '@/data/audit';
import { AppError, getById, insert, remove, update } from '@/data/repo';

export function auditedInsert<T extends TableName>(
  db: Db,
  ctx: Ctx,
  table: T,
  row: Omit<RowOf<T>, 'id' | 'version'>,
  entity: string,
  summary: (r: RowOf<T>) => string
): RowOf<T> {
  const r = insert(db, table, row);
  writeAudit(db, ctx, {
    entity,
    entityId: (r as { id: string }).id,
    action: 'CREATE',
    summary: summary(r),
    after: row as unknown as Record<string, unknown>,
  });
  return r;
}

export function auditedUpdate<T extends TableName>(
  db: Db,
  ctx: Ctx,
  table: T,
  id: string,
  patch: Partial<RowOf<T>>,
  version: number | undefined,
  entity: string,
  summary: (r: RowOf<T>) => string,
  action = 'UPDATE'
): RowOf<T> {
  const { row, before, after } = update(db, table, id, patch, version, entity.toLowerCase());
  if (Object.keys(after).length) {
    writeAudit(db, ctx, { entity, entityId: id, action, summary: summary(row), before, after });
  }
  return row;
}

export function auditedRemove<T extends TableName>(
  db: Db,
  ctx: Ctx,
  table: T,
  id: string,
  version: number | undefined,
  entity: string,
  summary: (r: RowOf<T>) => string
): RowOf<T> {
  const r = remove(db, table, id, version, entity.toLowerCase());
  writeAudit(db, ctx, {
    entity,
    entityId: id,
    action: 'DELETE',
    summary: summary(r),
    before: r as unknown as Record<string, unknown>,
  });
  return r;
}

export function fieldErrors(errors: Record<string, string>): void {
  if (Object.keys(errors).length)
    throw new AppError('Please correct the highlighted fields.', 'VALIDATION', errors);
}

export { getById };
