/** Row-level visibility: Account Officers see only their own customers' investments and transactions. */
import { getDb } from '@/data/store';
import { sessionUser } from './core';

/** Customer ids the signed-in user may see, or null for "all". */
export function visibleCustomerIds(): Set<string> | null {
  const u = sessionUser();
  if (!u || u.roleCode !== 'AO') return null;
  return new Set(
    getDb()
      .customers.filter((c) => c.accountOfficerId === u.id)
      .map((c) => c.id)
  );
}

export function canSeeCustomer(customerId: string, scope = visibleCustomerIds()): boolean {
  return !scope || scope.has(customerId);
}
