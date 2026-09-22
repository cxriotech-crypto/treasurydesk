// Backend integration point: replace mockImpl with httpImpl
import type { AppUser } from '@/types';
import { SEED_USERS } from './seedData';
import { nowLagosISO } from '@/lib/format';

const USER_STORAGE = 'td_users';
const SESSION_STORAGE = 'td_session';
const DELAY = 200;

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

function loadUsers(): AppUser[] {
  if (typeof window === 'undefined') return JSON.parse(JSON.stringify(SEED_USERS));
  try {
    const raw = localStorage.getItem(USER_STORAGE);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(SEED_USERS));
  } catch {
    return JSON.parse(JSON.stringify(SEED_USERS));
  }
}

export interface Session {
  user: AppUser;
  token: string;
  loginAt: string;
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(session: Session) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_STORAGE, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE);
}

export function switchRole(userId: string): Session | null {
  const users = loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  const session: Session = { user, token: `mock-token-${userId}`, loginAt: nowLagosISO() };
  setSession(session);
  return session;
}

export interface UserService {
  login(email: string, password: string): Promise<AppUser>;
  verifyOtp(userId: string, code: string): Promise<Session>;
  listAll(): Promise<AppUser[]>;
  getById(id: string): Promise<AppUser | null>;
}

export const userService: UserService = {
  async login(email: string) {
    await delay(DELAY);
    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.isActive);
    if (!user) throw new Error('No active account found for this email address.');
    return user;
  },

  async verifyOtp(_userId: string, code: string) {
    await delay(DELAY);
    if (code !== '123456') throw new Error('Invalid OTP code. Use 123456 for the demo.');
    const users = loadUsers();
    const user = users.find((u) => u.id === _userId);
    if (!user) throw new Error('User not found.');
    const session: Session = { user, token: `mock-token-${_userId}`, loginAt: nowLagosISO() };
    setSession(session);
    return session;
  },

  async listAll() {
    await delay(DELAY);
    return loadUsers();
  },

  async getById(id: string) {
    await delay(DELAY);
    return loadUsers().find((u) => u.id === id) ?? null;
  },
};