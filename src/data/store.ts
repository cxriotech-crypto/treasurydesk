/**
 * In-memory store persisted to localStorage under one versioned key.
 *
 * - SSR-safe: on the server (and in Node scripts) the store is memory-only.
 * - Every write goes through `mutate`, which persists, bumps the revision and notifies subscribers
 *   (screens re-fetch through `useData`). A failed write rolls back to the last good state.
 * - Demo data is relative to "today": a store seeded on an earlier day is re-seeded on load.
 */
import { todayLagos } from '@/lib/dates';
import { SCHEMA_VERSION, type Db } from './db';

export const STORAGE_KEY = 'treasurydesk.db.v1';

type Seeder = () => Db;

let db: Db | null = null;
let lastGood: string | null = null;
let revision = 0;
let seeder: Seeder | null = null;
let suspended = 0;
const listeners = new Set<() => void>();
const errorListeners = new Set<(message: string) => void>();

const hasWindow = () => typeof window !== 'undefined';

function storage(): Storage | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function registerSeeder(fn: Seeder): void {
  seeder = fn;
}

function freshSeed(): Db {
  if (!seeder) throw new Error('No seeder registered');
  return seeder();
}

function load(): Db | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Db;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
    if (parsed.seedDate !== todayLagos()) return null; // stale demo day → re-seed
    lastGood = raw;
    return parsed;
  } catch {
    return null;
  }
}

function persist(): void {
  if (!db) return;
  const ls = storage();
  if (!ls) return;
  try {
    const raw = JSON.stringify(db);
    ls.setItem(STORAGE_KEY, raw);
    lastGood = raw;
  } catch {
    errorListeners.forEach((l) =>
      l(
        'Browser storage is full. Changes are kept for this session only. Reset demo data to free space.'
      )
    );
    try {
      lastGood = JSON.stringify(db);
    } catch {
      /* ignore */
    }
  }
}

function emit(): void {
  revision += 1;
  listeners.forEach((l) => l());
}

export function getDb(): Db {
  if (!db) {
    db = load();
    if (!db) {
      db = freshSeed();
      persist();
    }
  }
  return db;
}

/** Apply a write. Throws (after rolling back) if fn throws. */
export function mutate<T>(fn: (d: Db) => T): T {
  const d = getDb();
  try {
    const result = fn(d);
    if (!suspended) {
      persist();
      emit();
    }
    return result;
  } catch (e) {
    if (!suspended && lastGood) {
      try {
        db = JSON.parse(lastGood) as Db;
      } catch {
        /* keep current */
      }
    }
    throw e;
  }
}

/** Run fn against a detached database (used by the seed generator). No persistence, no events. */
export function runWithDb<T>(target: Db, fn: () => T): T {
  const prevDb = db;
  const prevLastGood = lastGood;
  db = target;
  suspended += 1;
  try {
    return fn();
  } finally {
    suspended -= 1;
    db = prevDb;
    lastGood = prevLastGood;
  }
}

export function resetDemoData(): void {
  db = freshSeed();
  persist();
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onStoreError(listener: (message: string) => void): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

export function getRevision(): number {
  return revision;
}

// Keep several open tabs in step (e.g. one tab per role during a demo).
if (hasWindow()) {
  try {
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        db = JSON.parse(e.newValue) as Db;
        lastGood = e.newValue;
        emit();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}
