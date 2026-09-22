import type { IntegrationConfig, Settings, SysSettingsRecord } from '@/domain/types';
import { DEFAULT_SETTINGS } from '@/lib/calc';
import { nowIso } from '@/lib/dates';
import { isValidMoney } from '@/lib/money';
import { getDb, mutate, resetDemoData } from '@/data/store';
import { writeAudit } from '@/data/audit';
import { AppError, getById, update } from '@/data/repo';
import { USE_MOCK, ctx, http, run } from './core';
import { auditedUpdate, fieldErrors } from './crud';
import { EDITABLE_STATUSES, computeFor } from './workflow';

/** Label + one-line explanation per setting (shown in Settings with a live example). */
export const SETTING_META: Record<
  keyof Settings,
  { label: string; hint: string; group: 'RATES' | 'SLA' | 'DEMO' }
> = {
  whtRate: {
    label: 'WHT rate (%)',
    hint: 'Withholding tax deducted from interest.',
    group: 'RATES',
  },
  preliqChargeRate: {
    label: 'Pre-liquidation charge (%)',
    hint: 'Charged on accrued interest when an investment is broken early.',
    group: 'RATES',
  },
  transferFeeRate: {
    label: 'Transfer fee (%)',
    hint: 'Charged on third-party payments to other banks.',
    group: 'RATES',
  },
  dayCount: {
    label: 'Day-count basis',
    hint: 'Days in the interest year (365 or 360).',
    group: 'RATES',
  },
  whtOnAnniversary: {
    label: 'WHT on anniversary interest',
    hint: 'The SOP says WHT is not required on anniversary payments.',
    group: 'RATES',
  },
  whtBasisPreliq: {
    label: 'WHT basis on pre-liquidation',
    hint: 'Deduct WHT from interest after the charge, or from gross accrued interest.',
    group: 'RATES',
  },
  partialPreliqInterest: {
    label: 'Interest on partial pre-liquidation',
    hint: 'Not paid (SOP example), paid out with the requested amount, or capitalised into the rebooking.',
    group: 'RATES',
  },
  tpFeeMode: {
    label: 'Third-party fee mode',
    hint: 'Deduct the fee from the payment, or debit it on top.',
    group: 'RATES',
  },
  rolloverCInterest: {
    label: 'Rollover C interest',
    hint: 'Pay interest out with the principal balance, or roll it.',
    group: 'RATES',
  },
  rolloverABasis: {
    label: 'Rollover A basis',
    hint: 'Roll principal + interest net of WHT, or gross.',
    group: 'RATES',
  },
  maturityHolidayRule: {
    label: 'Maturity on a non-business day',
    hint: 'Move to the next business day, or keep the date.',
    group: 'RATES',
  },
  slaHours: {
    label: 'SLA (hours)',
    hint: 'Hours from instruction receipt to completion.',
    group: 'SLA',
  },
  slaCutoff: {
    label: 'Daily cut-off',
    hint: 'Instructions received after this time start the SLA at 08:00 on the next business day.',
    group: 'SLA',
  },
  demoLatencyMs: {
    label: 'Simulated latency (ms)',
    hint: 'Delay added to every demo service call.',
    group: 'DEMO',
  },
  gapsFailureRate: {
    label: 'GAPS failure rate (%)',
    hint: 'Share of simulated GAPS submissions that fail.',
    group: 'DEMO',
  },
};

export interface SettingsUpdateResult {
  record: SysSettingsRecord;
  draftsRecalculated: number;
}

export interface SettingsService {
  get(): Promise<SysSettingsRecord>;
  /** Synchronous read for live calculations (the store is local in the demo). */
  current(): Settings;
  defaults(): Settings;
  update(values: Settings, reason: string, version: number): Promise<SettingsUpdateResult>;
  integrations(): Promise<IntegrationConfig[]>;
  updateIntegration(
    id: string,
    patch: Pick<IntegrationConfig, 'endpoint' | 'username' | 'timeoutMs' | 'enabled'>,
    version: number
  ): Promise<IntegrationConfig>;
  testIntegration(id: string): Promise<IntegrationConfig>;
  resetDemoData(): Promise<void>;
}

function validate(v: Settings) {
  const e: Record<string, string> = {};
  const pctField = (k: keyof Settings, max = 100) => {
    const val = String(v[k]);
    if (!isValidMoney(val) || Number(val) < 0 || Number(val) > max)
      e[k] = `Enter a number between 0 and ${max}`;
  };
  pctField('whtRate');
  pctField('preliqChargeRate');
  pctField('transferFeeRate', 10);
  if (![365, 360].includes(v.dayCount)) e.dayCount = 'Choose 365 or 360';
  if (!Number.isInteger(v.slaHours) || v.slaHours < 1 || v.slaHours > 72)
    e.slaHours = 'Enter 1–72 hours';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.slaCutoff)) e.slaCutoff = 'Use HH:mm';
  if (!Number.isInteger(v.demoLatencyMs) || v.demoLatencyMs < 0 || v.demoLatencyMs > 3000)
    e.demoLatencyMs = 'Enter 0–3000 ms';
  if (!Number.isInteger(v.gapsFailureRate) || v.gapsFailureRate < 0 || v.gapsFailureRate > 100)
    e.gapsFailureRate = 'Enter 0–100';
  fieldErrors(e);
}

export const mockSettingsService: SettingsService = {
  get: () => run(() => getDb().settings),
  current: () => getDb().settings.values,
  defaults: () => ({ ...DEFAULT_SETTINGS }),
  update: (values, reason, version) =>
    run(() => {
      const c = ctx(['ADM']);
      if (!reason.trim())
        throw new AppError('Give a reason for the change.', 'VALIDATION', {
          reason: 'Reason is required',
        });
      validate(values);
      return mutate((db) => {
        if (db.settings.version !== version)
          throw new AppError(
            'Settings were changed by someone else. Reload and try again.',
            'CONFLICT'
          );
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        for (const k of Object.keys(values) as (keyof Settings)[]) {
          if (JSON.stringify(values[k]) !== JSON.stringify(db.settings.values[k])) {
            before[k] = db.settings.values[k];
            after[k] = values[k];
          }
        }
        db.settings = {
          ...db.settings,
          values: { ...values },
          version: db.settings.version + 1,
          updatedAt: c.at,
          updatedBy: c.userId,
        };
        // Open drafts recalculate with the new settings.
        let drafts = 0;
        for (const t of db.txns.filter((x) => EDITABLE_STATUSES.includes(x.status))) {
          try {
            const head = computeFor(db, t, c.at.slice(0, 10)).headlineAmt;
            if (head !== t.headlineAmt) update(db, 'txns', t.id, { headlineAmt: head });
          } catch {
            /* incomplete draft: nothing to recalculate yet */
          }
          drafts += 1;
        }
        writeAudit(db, c, {
          entity: 'SysSetting',
          entityId: 'SETTINGS',
          action: 'UPDATE',
          summary: `Settings changed (${Object.keys(after).join(', ') || 'no changes'}): ${reason.trim()}`,
          before,
          after,
        });
        return { record: db.settings, draftsRecalculated: drafts };
      });
    }),
  integrations: () => run(() => getDb().integrations),
  updateIntegration: (id, patch, version) =>
    run(() => {
      const c = ctx(['ADM']);
      const e: Record<string, string> = {};
      if (!patch.endpoint.trim()) e.endpoint = 'Endpoint is required';
      if (!Number.isInteger(patch.timeoutMs) || patch.timeoutMs < 1000 || patch.timeoutMs > 120000)
        e.timeoutMs = 'Enter 1,000–120,000 ms';
      fieldErrors(e);
      return mutate((db) =>
        auditedUpdate(
          db,
          c,
          'integrations',
          id,
          patch,
          version,
          'Integration',
          (i) => `Integration ${i.name} configuration updated`
        )
      );
    }),
  testIntegration: (id) =>
    run(() => {
      const c = ctx(['ADM']);
      const it = getById(getDb(), 'integrations', id, 'integration');
      const ms = 120 + ((it.endpoint.length * 37 + Date.now()) % 600);
      return mutate((db) =>
        auditedUpdate(
          db,
          c,
          'integrations',
          id,
          { lastTestAt: nowIso(), lastTestOk: it.enabled, lastTestMs: it.enabled ? ms : null },
          undefined,
          'Integration',
          (i) =>
            `Connection test to ${i.name}: ${it.enabled ? `OK in ${ms} ms (simulated)` : 'disabled'}`,
          'TEST'
        )
      );
    }, 900),
  resetDemoData: () =>
    run(() => {
      const c = ctx(['ADM']);
      resetDemoData();
      mutate((db) =>
        writeAudit(
          db,
          { ...c, at: nowIso() },
          {
            entity: 'System',
            entityId: 'DEMO',
            action: 'RESET',
            summary: 'Demo data reset to the seed',
          }
        )
      );
    }),
};

export const httpSettingsService: SettingsService = {
  get: () => http.get('/settings'),
  current: () => getDb().settings.values,
  defaults: () => ({ ...DEFAULT_SETTINGS }),
  update: (values, reason, version) => http.put('/settings', { values, reason, version }),
  integrations: () => http.get('/integrations'),
  updateIntegration: (id, patch, version) => http.put(`/integrations/${id}`, { ...patch, version }),
  testIntegration: (id) => http.post(`/integrations/${id}/test`),
  resetDemoData: () => http.post('/demo/reset'),
};

export const settingsService: SettingsService = USE_MOCK
  ? mockSettingsService
  : httpSettingsService;
