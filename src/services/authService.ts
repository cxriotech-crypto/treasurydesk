/** Demo sign-in: email + any password, then a 2FA code; role switcher; signature check. */
import type { AppUser } from '@/domain/types';
import { DEMO_OTP, signatureMatches } from '@/domain/rules';
import { nowIso } from '@/lib/dates';
import { getDb, mutate } from '@/data/store';
import { writeAudit } from '@/data/audit';
import { AppError, findById, update } from '@/data/repo';
import { USE_MOCK, http, readSession, run, sessionUser, writeSession } from './core';

export interface AuthService {
  /** Active users for the login quick-pick list. */
  demoUsers(): Promise<AppUser[]>;
  /** Step 1: email + password. Leaves the session waiting for the 2FA code. */
  login(
    email: string,
    password: string
  ): Promise<{ userId: string; fullName: string; email: string }>;
  /** Step 2: 2FA code. */
  verifyOtp(code: string): Promise<AppUser>;
  /** Role switcher: jump to another demo user in one click. */
  switchUser(userId: string): Promise<AppUser>;
  logout(reason?: 'USER' | 'IDLE'): Promise<void>;
  /** Check a typed signature (full name + PIN) for the current user. */
  checkSignature(name: string, pin: string): Promise<{ ok: boolean; error: string | null }>;
  /** Synchronous: signed-in user or null. */
  current(): AppUser | null;
  /** Synchronous: user waiting at the 2FA step, if any. */
  pending(): AppUser | null;
  /** Record user activity (idle timer). */
  touch(): void;
  /** When the signed-in user was last active (shared across tabs), or null. */
  lastActivityAt(): string | null;
}

function recordLogin(user: AppUser, how: string) {
  mutate((db) => {
    const at = nowIso();
    update(db, 'users', user.id, { lastLoginAt: at });
    writeAudit(
      db,
      { userId: user.id, at },
      {
        entity: 'Session',
        entityId: user.id,
        action: 'LOGIN',
        summary: `${user.fullName} signed in (${how})`,
      }
    );
  });
}

export const mockAuthService: AuthService = {
  demoUsers: () => run(() => getDb().users.filter((u) => u.status === 'ACTIVE')),

  login: (email, password) =>
    run(() => {
      const u = getDb().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!email.trim())
        throw new AppError('Enter your email address.', 'VALIDATION', {
          email: 'Email is required',
        });
      if (!password)
        throw new AppError('Enter your password.', 'VALIDATION', {
          password: 'Password is required',
        });
      if (!u)
        throw new AppError('No user with this email address.', 'VALIDATION', {
          email: 'No user with this email address',
        });
      if (u.status !== 'ACTIVE')
        throw new AppError('This user account is inactive.', 'FORBIDDEN', {
          email: 'User is inactive',
        });
      const at = nowIso();
      writeSession({ userId: u.id, stage: 'OTP', loginAt: at, lastActivityAt: at });
      return { userId: u.id, fullName: u.fullName, email: u.email };
    }),

  verifyOtp: (code) =>
    run(() => {
      const s = readSession();
      if (!s) throw new AppError('Your sign-in has expired. Start again.', 'FORBIDDEN');
      if (code.trim() !== DEMO_OTP)
        throw new AppError('Incorrect code.', 'VALIDATION', { code: 'Incorrect code' });
      const u = findById(getDb(), 'users', s.userId);
      if (!u) throw new AppError('User not found.', 'NOT_FOUND');
      const at = nowIso();
      writeSession({ ...s, stage: 'ACTIVE', lastActivityAt: at });
      recordLogin(u, 'password + 2FA');
      return findById(getDb(), 'users', u.id)!;
    }),

  switchUser: (userId) =>
    run(() => {
      const from = sessionUser();
      if (!from) throw new AppError('Sign in first.', 'FORBIDDEN');
      const to = findById(getDb(), 'users', userId);
      if (!to || to.status !== 'ACTIVE')
        throw new AppError('That user is not available.', 'NOT_FOUND');
      const at = nowIso();
      writeSession({ userId: to.id, stage: 'ACTIVE', loginAt: at, lastActivityAt: at });
      recordLogin(to, `role switch from ${from.fullName}`);
      return findById(getDb(), 'users', to.id)!;
    }),

  logout: (reason = 'USER') =>
    run(() => {
      const u = sessionUser();
      if (u) {
        mutate((db) =>
          writeAudit(
            db,
            { userId: u.id, at: nowIso() },
            {
              entity: 'Session',
              entityId: u.id,
              action: reason === 'IDLE' ? 'TIMEOUT' : 'LOGOUT',
              summary: `${u.fullName} ${reason === 'IDLE' ? 'signed out after 17 minutes idle' : 'signed out'}`,
            }
          )
        );
      }
      writeSession(null);
    }),

  checkSignature: (name, pin) =>
    run(() => {
      const u = sessionUser();
      if (!u) return { ok: false, error: 'Your session has ended.' };
      const error = signatureMatches(u, name, pin);
      return { ok: !error, error };
    }),

  current: () => sessionUser(),

  pending: () => {
    const s = readSession();
    if (!s || s.stage !== 'OTP') return null;
    return findById(getDb(), 'users', s.userId) ?? null;
  },

  touch: () => {
    const s = readSession();
    if (s && s.stage === 'ACTIVE') writeSession({ ...s, lastActivityAt: nowIso() }, false);
  },
  lastActivityAt: () => {
    const s = readSession();
    return s && s.stage === 'ACTIVE' ? s.lastActivityAt : null;
  },
};

export const httpAuthService: AuthService = {
  demoUsers: () => http.get('/auth/demo-users'),
  login: (email, password) => http.post('/auth/login', { email, password }),
  verifyOtp: (code) => http.post('/auth/otp', { code }),
  switchUser: (userId) => http.post('/auth/switch', { userId }),
  logout: (reason) => http.post('/auth/logout', { reason }),
  checkSignature: (name, pin) => http.post('/auth/signature-check', { name, pin }),
  current: () => sessionUser(),
  pending: () => null,
  touch: () => undefined,
  lastActivityAt: () => readSession()?.lastActivityAt ?? null,
};

export const authService: AuthService = USE_MOCK ? mockAuthService : httpAuthService;
