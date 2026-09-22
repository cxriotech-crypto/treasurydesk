/** Audit trail (hash-chained, append-only) and notifications. */
import type { AuditEvent, Ctx, Notification } from '@/domain/types';
import type { RoleCode } from '@/domain/codes';
import { sha256, stableStringify } from '@/lib/hash';
import type { Db } from './db';
import { findById, insert, nextCounter } from './repo';

export const GENESIS_HASH = '0'.repeat(64);
const BULKY_KEYS = new Set(['documentData', 'specimenSvg', 'rows']);

function slim(v: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!v) return null;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = BULKY_KEYS.has(k) && val ? '[omitted]' : val;
  }
  return Object.keys(out).length ? out : null;
}

function ipFor(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `10.20.${(h % 8) + 1}.${(h % 200) + 20}`;
}

/** Hash of an event's content (everything except id, version and the hash itself). */
export function hashEvent(e: Omit<AuditEvent, 'hash'> & { hash?: string }): string {
  const { id: _id, version: _v, hash: _h, ...rest } = e;
  return sha256(e.prevHash + stableStringify(rest));
}

export interface AuditInput {
  entity: string;
  entityId: string;
  action: string;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export function writeAudit(db: Db, ctx: Ctx, a: AuditInput): AuditEvent {
  const user = findById(db, 'users', ctx.userId);
  const prev = db.audit[db.audit.length - 1];
  const seqNo = nextCounter(db, 'auditSeq');
  const base = {
    seqNo,
    ts: ctx.at,
    userId: ctx.userId,
    roleCode: (user?.roleCode ?? 'SYSTEM') as RoleCode | 'SYSTEM',
    entity: a.entity,
    entityId: a.entityId,
    action: a.action,
    summary: a.summary,
    before: slim(a.before),
    after: slim(a.after),
    ipAddr: user ? ipFor(user.id) : '127.0.0.1',
    prevHash: prev ? prev.hash : GENESIS_HASH,
  };
  const row = insert(db, 'audit', { ...base, hash: '' });
  row.hash = hashEvent(row);
  return row;
}

export interface IntegrityResult {
  ok: boolean;
  checked: number;
  brokenAtSeq: number | null;
  message: string;
}

export function verifyAuditChain(events: AuditEvent[]): IntegrityResult {
  const sorted = [...events].sort((a, b) => a.seqNo - b.seqNo);
  let prev = GENESIS_HASH;
  for (const e of sorted) {
    if (e.prevHash !== prev || hashEvent(e) !== e.hash) {
      return {
        ok: false,
        checked: sorted.length,
        brokenAtSeq: e.seqNo,
        message: `Chain broken at event #${e.seqNo}: the record was altered after it was written.`,
      };
    }
    prev = e.hash;
  }
  return {
    ok: true,
    checked: sorted.length,
    brokenAtSeq: null,
    message: `All ${sorted.length} events verified. The hash chain is intact.`,
  };
}

export interface NotifyInput {
  targetRole?: RoleCode | null;
  targetUserId?: string | null;
  title: string;
  body: string;
  link: string;
}

export function notify(db: Db, ctx: Ctx, n: NotifyInput): Notification {
  return insert(db, 'notifications', {
    targetRole: n.targetRole ?? null,
    targetUserId: n.targetUserId ?? null,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: ctx.at,
    readBy: [],
    clearedBy: [],
  });
}
