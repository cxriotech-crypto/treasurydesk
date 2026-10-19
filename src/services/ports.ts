/**
 * Integration ports: the only way the service layer reaches Eazybankz (core banking) and GAPS (payments).
 *
 * The demo runs the simulators below in the browser. The backend installs its own adapters (a simulator by default,
 * the real Eazybankz/GAPS adapters once the client's specifications arrive) with `configurePorts`. Service code
 * calls ports outside `run()`, so a slow or failing external system never holds a write open.
 *
 * Money is always a 2-dp string; outcomes that are not known are reported as UNKNOWN, never guessed.
 */
import type { IntegrationConfig } from '@/domain/types';
import { accruedInterest } from '@/lib/calc';
import { nowIso } from '@/lib/dates';
import { add } from '@/lib/money';
import { getDb } from '@/data/store';

export interface HealthResult {
  ok: boolean;
  /** Round trip in milliseconds, when measured. */
  ms: number | null;
  detail: string;
}

// ─── Eazybankz ──────────────────────────────────────────────────────────────

export interface CbsSnapshotRequest {
  investmentRef: string | null;
  sourceAccountNo: string | null;
  /** The customer's Personal Account, shown when there is no source account. */
  paAccountNo: string | null;
  asOf: string;
}

export interface CbsSnapshotData {
  syncedAt: string;
  investment: {
    investmentRef: string;
    principalAmt: string;
    accruedInterest: string;
    intRate: string;
    effectiveDate: string;
    maturityDate: string;
    /** What can be paid out today (principal, or principal + interest at or after maturity). */
    availableAmt: string;
  } | null;
  sourceAccount: {
    accountNo: string;
    productCode: string;
    ledgerBal: string;
    availableBal: string;
  } | null;
  pa: { accountNo: string; availableBal: string } | null;
}

export interface CoreBankingPort {
  readonly mode: 'simulator' | 'real';
  snapshot(req: CbsSnapshotRequest): Promise<CbsSnapshotData>;
  health(cfg: IntegrationConfig): Promise<HealthResult>;
}

// ─── GAPS / NIP ─────────────────────────────────────────────────────────────
//
// TreasuryDesk does not send payments: Operations pay in GAPS themselves and record the outcome (reference, or
// failure and reason), which a second officer approves. The only call made is the beneficiary name enquiry.

export type NameEnquiryOutcome = { ok: true; accountName: string } | { ok: false; reason: string };

export interface PaymentPort {
  readonly mode: 'simulator' | 'real';
  nameEnquiry(bankCode: string, accountNo: string): Promise<NameEnquiryOutcome>;
  health(cfg: IntegrationConfig): Promise<HealthResult>;
}

// ─── Simulators (same behaviour as the original demo) ───────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createCoreBankingSimulator(opts: { latencyMs?: number } = {}): CoreBankingPort {
  return {
    mode: 'simulator',
    async snapshot(req) {
      if (opts.latencyMs) await sleep(opts.latencyMs);
      const db = getDb();
      const inv = req.investmentRef
        ? db.investments.find((i) => i.investmentRef === req.investmentRef)
        : undefined;
      const src = req.sourceAccountNo
        ? db.accounts.find((a) => a.accountNo === req.sourceAccountNo)
        : undefined;
      const pa = req.paAccountNo
        ? db.accounts.find((a) => a.accountNo === req.paAccountNo)
        : undefined;
      let investment: CbsSnapshotData['investment'] = null;
      if (inv) {
        const ai = accruedInterest(inv, req.asOf, db.settings.values).value;
        investment = {
          investmentRef: inv.investmentRef,
          principalAmt: inv.principalAmt,
          accruedInterest: ai,
          intRate: inv.intRate,
          effectiveDate: inv.effectiveDate,
          maturityDate: inv.maturityDate,
          availableAmt:
            inv.status === 'MATURED' || inv.maturityDate <= req.asOf
              ? add(inv.principalAmt, ai)
              : inv.principalAmt,
        };
      }
      return {
        syncedAt: nowIso(),
        investment,
        sourceAccount: src
          ? {
              accountNo: src.accountNo,
              productCode: src.productCode,
              ledgerBal: src.ledgerBal,
              availableBal: src.availableBal,
            }
          : null,
        pa: pa ? { accountNo: pa.accountNo, availableBal: pa.availableBal } : null,
      };
    },
    async health(cfg) {
      const ms = 120 + ((cfg.endpoint.length * 37 + Date.now()) % 600);
      return cfg.enabled
        ? { ok: true, ms, detail: `OK in ${ms} ms (simulated)` }
        : { ok: false, ms: null, detail: 'disabled' };
    },
  };
}

/** Names the simulated name enquiry returns for accounts it has not seen. */
const SURNAMES = [
  'Okeke',
  'Adeyemi',
  'Ibrahim',
  'Nwosu',
  'Balogun',
  'Eze',
  'Lawal',
  'Okafor',
  'Bello',
  'Ogunbiyi',
  'Umeh',
  'Salami',
];
const FIRSTS = [
  'Chinwe',
  'Tolu',
  'Abubakar',
  'Ngozi',
  'Kayode',
  'Ifeanyi',
  'Fatima',
  'Segun',
  'Adaora',
  'Musa',
  'Temitope',
  'Nnamdi',
];

function hashOf(s: string): number {
  return [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
}

export interface GapsSimulatorOptions {
  /** Round trip to simulate for a name enquiry. */
  latencyMs?: number;
}

export function createGapsSimulator(opts: GapsSimulatorOptions = {}): PaymentPort {
  return {
    mode: 'simulator',
    async nameEnquiry(_bankCode, accountNo) {
      if (opts.latencyMs) await sleep(Math.min(opts.latencyMs, 1000));
      const h = hashOf(accountNo);
      return {
        ok: true,
        accountName:
          `${FIRSTS[h % FIRSTS.length]} ${SURNAMES[(h >> 4) % SURNAMES.length]}`.toUpperCase(),
      };
    },
    async health(cfg) {
      const ms = 120 + ((cfg.endpoint.length * 37 + Date.now()) % 600);
      return cfg.enabled
        ? { ok: true, ms, detail: `OK in ${ms} ms (simulated)` }
        : { ok: false, ms: null, detail: 'disabled' };
    },
  };
}

// ─── Registry ───────────────────────────────────────────────────────────────

export interface Ports {
  coreBanking: CoreBankingPort;
  payments: PaymentPort;
  /**
   * True when balances are owned by the core banking system: TreasuryDesk then never accepts a balance typed or
   * imported by a user (backend docs/SECURITY.md, finding F4). The demo keeps editable demo balances.
   */
  balancesFromCore: boolean;
}

const inBrowser = typeof window !== 'undefined';

let current: Ports = {
  coreBanking: createCoreBankingSimulator({ latencyMs: inBrowser ? 600 : 0 }),
  payments: createGapsSimulator({ latencyMs: inBrowser ? 1000 : 0 }),
  balancesFromCore: false,
};

export function ports(): Ports {
  return current;
}

export function configurePorts(p: Partial<Ports>): void {
  current = { ...current, ...p };
}
