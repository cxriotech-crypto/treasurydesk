import type { AuditEvent, ListQuery, ListResult } from '@/domain/types';
import type { RoleCode } from '@/domain/codes';
import { isoDatePart } from '@/lib/dates';
import { getDb } from '@/data/store';
import { verifyAuditChain, type IntegrityResult } from '@/data/audit';
import { matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, http, requireUser, run } from './core';
import { userName } from './transactionsService';

export interface AuditFilters {
  search?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  userId?: string;
  roleCode?: RoleCode | 'SYSTEM';
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditRow extends AuditEvent {
  userName: string;
}

export interface AuditService {
  list(q?: ListQuery<AuditFilters>): Promise<ListResult<AuditRow>>;
  /** Distinct entity and action names for the filter menus. */
  facets(): Promise<{ entities: string[]; actions: string[] }>;
  verifyIntegrity(): Promise<IntegrityResult>;
}

const AUDIT_ROLES: RoleCode[] = ['AUD', 'MD', 'ADM'];

export const mockAuditService: AuditService = {
  list: (q = {}) =>
    run(() => {
      requireUser(AUDIT_ROLES);
      const db = getDb();
      const f = q.filters ?? {};
      const rows = db.audit
        .filter(
          (e) =>
            (!f.entity || e.entity === f.entity) &&
            (!f.entityId || e.entityId === f.entityId) &&
            (!f.action || e.action === f.action) &&
            (!f.userId || e.userId === f.userId) &&
            (!f.roleCode || e.roleCode === f.roleCode) &&
            (!f.dateFrom || isoDatePart(e.ts) >= f.dateFrom) &&
            (!f.dateTo || isoDatePart(e.ts) <= f.dateTo)
        )
        .map((e) => ({ ...e, userName: userName(db, e.userId) }))
        .filter((e) => matchesSearch(f.search, e.summary, e.userName, e.entityId, e.action));
      return paginate(rows, { sort: { field: 'seqNo', dir: 'desc' }, ...q });
    }),
  facets: () =>
    run(() => {
      const db = getDb();
      return {
        entities: [...new Set(db.audit.map((e) => e.entity))].sort(),
        actions: [...new Set(db.audit.map((e) => e.action))].sort(),
      };
    }),
  verifyIntegrity: () =>
    run(() => {
      requireUser(AUDIT_ROLES);
      return verifyAuditChain(getDb().audit);
    }, 600),
};

export const httpAuditService: AuditService = {
  list: (q) => http.get('/audit', q as Record<string, unknown>),
  facets: () => http.get('/audit/facets'),
  verifyIntegrity: () => http.post('/audit/verify'),
};

export const auditService: AuditService = USE_MOCK ? mockAuditService : httpAuditService;
