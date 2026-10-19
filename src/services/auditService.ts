import type { AuditEvent, AuditReviewStatus, ListQuery, ListResult } from '@/domain/types';
import type { RoleCode } from '@/domain/codes';
import { isoDatePart } from '@/lib/dates';
import { getDb } from '@/data/store';
import { verifyAuditChain, type IntegrityResult } from '@/data/audit';
import { matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run } from './core';
import * as wf from './workflow';
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
  review?: AuditReviewStatus;
}

export interface AuditReviewView {
  status: AuditReviewStatus;
  note: string;
  reviewedByName: string;
  reviewedAt: string;
}

export interface AuditRow extends AuditEvent {
  userName: string;
  /** Internal Audit's current review of this entry; null = never reviewed. */
  review: AuditReviewView | null;
  /** Why the signed-in auditor cannot review this entry, or null. */
  reviewBlocker: string | null;
}

export interface AuditReviewCounts {
  total: number;
  verified: number;
  flagged: number;
  notReviewed: number;
}

export interface AuditService {
  list(q?: ListQuery<AuditFilters>): Promise<ListResult<AuditRow>>;
  /** Distinct entity and action names for the filter menus. */
  facets(): Promise<{ entities: string[]; actions: string[] }>;
  verifyIntegrity(): Promise<IntegrityResult>;
  /** How many entries are verified, flagged and not yet reviewed. */
  reviewCounts(): Promise<AuditReviewCounts>;
  /** Every review of one entry, oldest first. */
  reviewHistory(eventId: string): Promise<AuditReviewView[]>;
  /** Internal Audit: mark entries verified, flag them (reason required) or reopen them (reason required). */
  review(
    eventIds: string[],
    status: AuditReviewStatus,
    note: string
  ): Promise<wf.AuditReviewResult>;
}

const AUDIT_ROLES: RoleCode[] = ['AUD', 'MD', 'ADM'];

export const mockAuditService: AuditService = {
  list: (q = {}) =>
    run(() => {
      requireUser(AUDIT_ROLES);
      const u = requireUser(AUDIT_ROLES);
      const db = getDb();
      const f = q.filters ?? {};
      const reviews = wf.currentAuditReviews(db);
      const rows = db.audit
        .filter(
          (e) =>
            (!f.entity || e.entity === f.entity) &&
            (!f.entityId || e.entityId === f.entityId) &&
            (!f.action || e.action === f.action) &&
            (!f.userId || e.userId === f.userId) &&
            (!f.roleCode || e.roleCode === f.roleCode) &&
            (!f.dateFrom || isoDatePart(e.ts) >= f.dateFrom) &&
            (!f.dateTo || isoDatePart(e.ts) <= f.dateTo) &&
            (!f.review || (reviews.get(e.id)?.status ?? 'NOT_REVIEWED') === f.review)
        )
        .map((e) => {
          const r = reviews.get(e.id);
          return {
            ...e,
            userName: userName(db, e.userId),
            review:
              r && r.status !== 'NOT_REVIEWED'
                ? {
                    status: r.status,
                    note: r.note,
                    reviewedByName: userName(db, r.reviewedBy),
                    reviewedAt: r.reviewedAt,
                  }
                : null,
            reviewBlocker:
              u.roleCode !== 'AUD'
                ? 'Only Internal Audit reviews entries'
                : e.userId === u.id
                  ? 'Your own action — another auditor reviews it'
                  : null,
          };
        })
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
  reviewCounts: () =>
    run(() => {
      requireUser(AUDIT_ROLES);
      const db = getDb();
      const reviews = wf.currentAuditReviews(db);
      let verified = 0;
      let flagged = 0;
      for (const r of reviews.values()) {
        if (r.status === 'VERIFIED') verified++;
        else if (r.status === 'FLAGGED') flagged++;
      }
      const total = db.audit.length;
      return { total, verified, flagged, notReviewed: total - verified - flagged };
    }),
  reviewHistory: (eventId) =>
    run(() => {
      requireUser(AUDIT_ROLES);
      const db = getDb();
      return db.auditReviews
        .filter((r) => r.auditEventId === eventId)
        .map((r) => ({
          status: r.status,
          note: r.note,
          reviewedByName: userName(db, r.reviewedBy),
          reviewedAt: r.reviewedAt,
        }));
    }),
  review: (eventIds, status, note) =>
    run(() => wf.reviewAuditEvents(ctx(['AUD']), eventIds, status, note)),
};

export const httpAuditService: AuditService = {
  list: (q) => http.get('/audit', q as Record<string, unknown>),
  facets: () => http.get('/audit/facets'),
  verifyIntegrity: () => http.post('/audit/verify'),
  reviewCounts: () => http.get('/audit/review-counts'),
  reviewHistory: (eventId) => http.get(`/audit/${eventId}/reviews`),
  review: (eventIds, status, note) => http.post('/audit/reviews', { eventIds, status, note }),
};

export const auditService: AuditService = USE_MOCK ? mockAuditService : httpAuditService;
