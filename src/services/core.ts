/**
 * Shared plumbing for services: mock/http switch, simulated latency, the signed-in session,
 * the write context and a tiny HTTP client for Phase 2.
 */
import type { AppUser, Ctx } from '@/domain/types';
import type { RoleCode } from '@/domain/codes';
import { nowIso } from '@/lib/dates';
import '@/data/bootstrap';
import { getDb } from '@/data/store';
import { AppError, clone, findById } from '@/data/repo';

export { AppError } from '@/data/repo';

/** NEXT_PUBLIC_USE_MOCK=false switches every service to its HTTP implementation. */
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Simulated service latency (browser only; scripts run instantly). */
export async function latency(extraMs = 0): Promise<void> {
  if (typeof window === 'undefined') return;
  const ms = getDb().settings.values.demoLatencyMs + extraMs;
  if (ms > 0) await sleep(ms);
}

/** Run a mock operation after the simulated latency and return a detached copy. */
export async function run<T>(fn: () => T, extraMs = 0): Promise<T> {
  await latency(extraMs);
  const result = fn();
  return result === undefined ? result : clone(result);
}

/** Local, instant operation (e.g. live calculations): no simulated latency. */
export async function runNow<T>(fn: () => T): Promise<T> {
  const result = fn();
  return result === undefined ? result : clone(result);
}

// ─── Session ─────────────────────────────────────────────────────────────────

export const SESSION_KEY = 'treasurydesk.session.v1';

export interface Session {
  userId: string;
  stage: 'OTP' | 'ACTIVE';
  loginAt: string;
  lastActivityAt: string;
}

let memorySession: Session | null = null;
const sessionListeners = new Set<() => void>();
let sessionRevision = 0;

function ls(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSession(): Session | null {
  const s = ls();
  if (!s) return memorySession;
  try {
    const raw = s.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return memorySession;
  }
}

/** Save the session. `notify: false` for activity pings, which must not re-render screens. */
export function writeSession(session: Session | null, notify = true): void {
  memorySession = session;
  const s = ls();
  if (s) {
    try {
      if (session) s.setItem(SESSION_KEY, JSON.stringify(session));
      else s.removeItem(SESSION_KEY);
    } catch {
      /* memory fallback already set */
    }
  }
  if (!notify) return;
  sessionRevision += 1;
  sessionListeners.forEach((l) => l());
}

// Sign-in / sign-out / role switch in another tab.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('storage', (e) => {
      if (e.key !== SESSION_KEY) return;
      const prev = memorySession;
      memorySession = e.newValue ? (JSON.parse(e.newValue) as Session) : null;
      if (prev?.userId === memorySession?.userId && prev?.stage === memorySession?.stage) return;
      sessionRevision += 1;
      sessionListeners.forEach((l) => l());
    });
  } catch {
    /* ignore */
  }
}

export function subscribeSession(l: () => void): () => void {
  sessionListeners.add(l);
  return () => sessionListeners.delete(l);
}

export function getSessionRevision(): number {
  return sessionRevision;
}

/** The signed-in (OTP-verified) user, or null. */
export function sessionUser(): AppUser | null {
  const s = readSession();
  if (!s || s.stage !== 'ACTIVE') return null;
  const u = findById(getDb(), 'users', s.userId);
  return u && u.status === 'ACTIVE' ? u : null;
}

export function requireUser(roles?: RoleCode[]): AppUser {
  const u = sessionUser();
  if (!u) throw new AppError('Your session has ended. Please sign in again.', 'FORBIDDEN');
  if (roles && !roles.includes(u.roleCode))
    throw new AppError('Your role is not allowed to do this.', 'FORBIDDEN');
  return u;
}

/** Write context for the signed-in user at the current time. */
export function ctx(roles?: RoleCode[]): Ctx {
  const u = requireUser(roles);
  return { userId: u.id, at: nowIso() };
}

// ─── HTTP (Phase 2) ──────────────────────────────────────────────────────────

type Query = Record<string, unknown> | undefined;

function toQueryString(q: Query): string {
  if (!q) return '';
  const params = new URLSearchParams();
  const walk = (prefix: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    if (typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, vv] of Object.entries(v as Record<string, unknown>))
        walk(prefix ? `${prefix}.${k}` : k, vv);
    } else if (Array.isArray(v)) {
      v.forEach((x) => walk(prefix, x));
    } else {
      params.append(prefix, String(v));
    }
  };
  walk('', q);
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}${toQueryString(query)}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let fieldErrors: Record<string, string> = {};
    try {
      const j = (await res.json()) as { message?: string; fieldErrors?: Record<string, string> };
      message = j.message ?? message;
      fieldErrors = j.fieldErrors ?? {};
    } catch {
      /* non-JSON error */
    }
    const code =
      res.status === 403
        ? 'FORBIDDEN'
        : res.status === 404
          ? 'NOT_FOUND'
          : res.status === 409
            ? 'CONFLICT'
            : 'VALIDATION';
    throw new AppError(message, code, fieldErrors);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, query?: Query) => request<T>('DELETE', path, undefined, query),
};
