/**
 * src/services/settingsService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides access to SysSetting records.
 * getSettings() returns a plain key→value map for use in calc.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SysSetting } from '@/types';

const STORAGE_KEY = 'td_settings';

export const DEFAULT_SETTINGS_MAP: Record<string, string> = {
  WHT_RATE: '10',
  PRELIQ_CHARGE_RATE: '20',
  TRANSFER_FEE_RATE: '0.10',
  DAY_COUNT: '365',
  WHT_ON_ANNIVERSARY: 'false',
  WHT_BASIS_PRELIQ: 'AFTER_CHARGE',
  PARTIAL_PRELIQ_INTEREST: 'NOT_PAID',
  TP_FEE_MODE: 'DEDUCT',
  ROLLOVER_C_INTEREST: 'PAY_OUT',
  ROLLOVER_A_BASIS: 'NET',
  MATURITY_HOLIDAY_RULE: 'NEXT_BUSINESS_DAY',
  SLA_CUTOFF: '15:00',
  SLA_HOURS: '8',
};

/**
 * Returns the current settings as a key→value map.
 * Falls back to defaults for any missing key.
 * Safe to call on the server (returns defaults when localStorage unavailable).
 */
export function getSettings(): Record<string, string> {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS_MAP };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS_MAP };
    const records: SysSetting[] = JSON.parse(raw);
    const map: Record<string, string> = { ...DEFAULT_SETTINGS_MAP };
    for (const s of records) {
      map[s.key] = s.value;
    }
    return map;
  } catch {
    return { ...DEFAULT_SETTINGS_MAP };
  }
}

/**
 * Returns a single setting value, falling back to the default.
 */
export function getSetting(key: string): string {
  return getSettings()[key] ?? DEFAULT_SETTINGS_MAP[key] ?? '';
}

// ─── Full CRUD service ────────────────────────────────────────────────────────

function load(): SysSetting[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(records: SysSetting[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export const settingsService = {
  /** Seed settings into localStorage (called by seed loader) */
  seed(records: SysSetting[]): void {
    save(records);
  },

  /** List all settings */
  async list(): Promise<SysSetting[]> {
    await delay(100);
    const stored = load();
    if (stored.length === 0) {
      // Return defaults as SysSetting array
      return Object.entries(DEFAULT_SETTINGS_MAP).map(([key, value]) => ({
        key,
        value,
        label: key,
        group: 'General',
      }));
    }
    return stored;
  },

  /** Get a single setting by key */
  async get(key: string): Promise<SysSetting | undefined> {
    const all = await this.list();
    return all.find((s) => s.key === key);
  },

  /** Update a setting value */
  async update(key: string, value: string): Promise<SysSetting> {
    await delay(150);
    const records = load();
    const idx = records.findIndex((s) => s.key === key);
    if (idx >= 0) {
      records[idx] = { ...records[idx], value };
    } else {
      records.push({ key, value, label: key, group: 'General' });
    }
    save(records);
    return records[idx >= 0 ? idx : records.length - 1];
  },

  /** Bulk update */
  async bulkUpdate(updates: Record<string, string>): Promise<void> {
    await delay(200);
    const records = load();
    for (const [key, value] of Object.entries(updates)) {
      const idx = records.findIndex((s) => s.key === key);
      if (idx >= 0) {
        records[idx] = { ...records[idx], value };
      } else {
        records.push({ key, value, label: key, group: 'General' });
      }
    }
    save(records);
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
