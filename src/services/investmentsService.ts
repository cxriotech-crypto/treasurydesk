import type { Customer, Investment, ListQuery, ListResult, TreasuryTxn } from '@/domain/types';
import {
  SCENARIO_CODES,
  SCENARIO_META,
  scenarioLabel,
  type InvestmentStatus,
  type ProductCode,
  type ScenarioCode,
} from '@/domain/codes';
import { investmentIneligibility } from '@/domain/rules';
import {
  accruedDays,
  accruedInterest,
  calcAnniversary,
  calcMaturity,
  interest,
  type Fig,
} from '@/lib/calc';
import { addDays, daysBetween, todayLagos } from '@/lib/dates';
import { add, ZERO } from '@/lib/money';
import type { Db } from '@/data/db';
import { getDb } from '@/data/store';
import { AppError, findById, getById, matchesSearch, paginate } from '@/data/repo';
import { USE_MOCK, http, run } from './core';
import { canSeeCustomer, visibleCustomerIds } from './scope';
import { LOCKING_STATUSES, envOf } from './workflow';

export interface InvestmentFilters {
  search?: string;
  /** 'LIVE' = ACTIVE or MATURED. */
  status?: InvestmentStatus | 'LIVE';
  productCode?: ProductCode;
  customerId?: string;
  maturityFrom?: string;
  maturityTo?: string;
  /** Anniversary due within N days. */
  annivWithinDays?: number;
}

export interface InvestmentRow extends Investment {
  customerName: string;
  cifNo: string;
  accruedInterest: string;
  accruedDays: number;
  daysToMaturity: number;
  projectedInterest: string;
}

export interface InvestmentSummary {
  count: number;
  principal: string;
  accruedInterest: string;
  projectedInterest: string;
}

export interface InvestmentList extends ListResult<InvestmentRow> {
  summary: InvestmentSummary;
}

export interface AnniversaryLine {
  date: string;
  periodInterest: string;
  state: 'PAID' | 'DUE' | 'UPCOMING';
}

export interface InvestmentAction {
  scenarioCode: ScenarioCode;
  label: string;
  disabledReason: string | null;
}

export interface InvestmentDetail {
  investment: Investment;
  customer: Customer;
  asOf: string;
  accrued: Fig;
  accruedDays: number;
  progressPct: number;
  daysToMaturity: number;
  projectedMaturityValue: Fig;
  projectedInterest: Fig;
  anniversaries: AnniversaryLine[];
  linkedTxns: Pick<
    TreasuryTxn,
    'id' | 'txnRef' | 'scenarioCode' | 'status' | 'headlineAmt' | 'createdAt'
  >[];
  parent: Pick<Investment, 'id' | 'investmentRef' | 'status'> | null;
  children: Pick<Investment, 'id' | 'investmentRef' | 'status'>[];
  actions: InvestmentAction[];
}

export interface InvestmentsService {
  list(q?: ListQuery<InvestmentFilters>): Promise<InvestmentList>;
  get(id: string): Promise<InvestmentDetail>;
  /** Investments a scenario can start from (wizard step 1), each with the reason if not eligible. */
  forScenario(
    scenario: ScenarioCode,
    customerId: string,
    /** The draft asking (its own lock is ignored). */
    exceptTxnId?: string
  ): Promise<(InvestmentRow & { disabledReason: string | null })[]>;
}

function hasOpen(db: Db, invId: string, exceptTxnId?: string): boolean {
  return db.txns.some(
    (t) => t.investmentId === invId && t.id !== exceptTxnId && LOCKING_STATUSES.includes(t.status)
  );
}

function toRow(db: Db, i: Investment, asOf: string): InvestmentRow {
  const c = findById(db, 'customers', i.customerId);
  const settings = db.settings.values;
  const live = i.status === 'ACTIVE' || i.status === 'MATURED';
  return {
    ...i,
    customerName: c?.customerName ?? '',
    cifNo: c?.cifNo ?? '',
    accruedInterest: live ? accruedInterest(i, asOf, settings).value : ZERO,
    accruedDays: live ? accruedDays(i, asOf) : 0,
    daysToMaturity: daysBetween(asOf, i.maturityDate),
    projectedInterest: interest(i.principalAmt, i.intRate, i.tenorDays, settings.dayCount).value,
  };
}

export const mockInvestmentsService: InvestmentsService = {
  list: (q = {}) =>
    run(() => {
      const db = getDb();
      const asOf = todayLagos();
      const f = q.filters ?? {};
      const scope = visibleCustomerIds();
      const rows = db.investments
        .filter(
          (i) =>
            canSeeCustomer(i.customerId, scope) &&
            (!f.status ||
              (f.status === 'LIVE'
                ? i.status === 'ACTIVE' || i.status === 'MATURED'
                : i.status === f.status)) &&
            (!f.productCode || i.productCode === f.productCode) &&
            (!f.customerId || i.customerId === f.customerId) &&
            (!f.maturityFrom || i.maturityDate >= f.maturityFrom) &&
            (!f.maturityTo || i.maturityDate <= f.maturityTo) &&
            (f.annivWithinDays === undefined ||
              (!!i.nextAnnivDate &&
                i.status === 'ACTIVE' &&
                i.nextAnnivDate <= addDays(asOf, f.annivWithinDays)))
        )
        .map((i) => toRow(db, i, asOf))
        .filter((r) => matchesSearch(f.search, r.investmentRef, r.customerName, r.cifNo));
      const summary: InvestmentSummary = {
        count: rows.length,
        principal: add(ZERO, ...rows.map((r) => r.principalAmt)),
        accruedInterest: add(ZERO, ...rows.map((r) => r.accruedInterest)),
        projectedInterest: add(ZERO, ...rows.map((r) => r.projectedInterest)),
      };
      return { ...paginate(rows, { sort: { field: 'maturityDate', dir: 'asc' }, ...q }), summary };
    }),

  get: (id) =>
    run(() => {
      const db = getDb();
      const asOf = todayLagos();
      const inv = getById(db, 'investments', id, 'investment');
      if (!canSeeCustomer(inv.customerId))
        throw new AppError('You do not have access to this investment.', 'FORBIDDEN');
      const customer = getById(db, 'customers', inv.customerId, 'customer');
      const env = envOf(db);
      const live = inv.status === 'ACTIVE' || inv.status === 'MATURED';
      const accrued = live
        ? accruedInterest(inv, asOf, env.settings)
        : { value: ZERO, formula: 'Investment is closed', days: 0 };
      const days = live ? accruedDays(inv, asOf) : 0;
      const maturity = calcMaturity(inv, customer.whtExempt, env);

      const anniversaries: AnniversaryLine[] = [];
      if (inv.annivFreqDays) {
        const period = inv.annivFreqDays;
        const perInterest = calcAnniversary(inv, period, customer.whtExempt, env).periodInterest
          .value;
        for (
          let d = addDays(inv.effectiveDate, period);
          d < inv.maturityDate;
          d = addDays(d, period)
        ) {
          const paid = inv.nextAnnivDate ? d < inv.nextAnnivDate : live ? false : true;
          anniversaries.push({
            date: d,
            periodInterest: perInterest,
            state: paid ? 'PAID' : d <= addDays(asOf, 14) ? 'DUE' : 'UPCOMING',
          });
        }
      }

      const linkedTxns = db.txns
        .filter(
          (t) =>
            t.investmentId === inv.id || t.resultInvestmentId === inv.id || t.id === inv.originTxnId
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((t) => ({
          id: t.id,
          txnRef: t.txnRef,
          scenarioCode: t.scenarioCode,
          status: t.status,
          headlineAmt: t.headlineAmt,
          createdAt: t.createdAt,
        }));
      const parent = findById(db, 'investments', inv.parentInvestmentId);
      const open = hasOpen(db, inv.id);
      const actions: InvestmentAction[] = SCENARIO_CODES.filter(
        (s) => SCENARIO_META[s].subject === 'INVESTMENT'
      ).map((s) => ({
        scenarioCode: s,
        label: scenarioLabel(s),
        disabledReason: investmentIneligibility(s, inv, asOf, open),
      }));
      const originTxn = inv.originTxnId ? findById(db, 'txns', inv.originTxnId) : undefined;
      if (originTxn) {
        const rev =
          originTxn.status !== 'COMPLETED'
            ? 'Only completed bookings can be reversed'
            : originTxn.reversedByTxnId
              ? 'Already reversed'
              : inv.status !== 'ACTIVE'
                ? 'Investment is no longer active'
                : db.txns.some(
                      (t) =>
                        t.reversalOfTxnId === originTxn.id && LOCKING_STATUSES.includes(t.status)
                    )
                  ? 'A reversal is already in progress'
                  : null;
        actions.push({
          scenarioCode: 'TRANSFER_REVERSAL',
          label: scenarioLabel('TRANSFER_REVERSAL'),
          disabledReason: rev,
        });
      }

      return {
        investment: inv,
        customer,
        asOf,
        accrued: { value: accrued.value, formula: accrued.formula },
        accruedDays: days,
        progressPct: Math.min(100, Math.round((days / Math.max(1, inv.tenorDays)) * 100)),
        daysToMaturity: daysBetween(asOf, inv.maturityDate),
        projectedMaturityValue: maturity.net,
        projectedInterest: maturity.interest,
        anniversaries,
        linkedTxns,
        parent: parent
          ? { id: parent.id, investmentRef: parent.investmentRef, status: parent.status }
          : null,
        children: db.investments
          .filter((c) => c.parentInvestmentId === inv.id)
          .map((c) => ({ id: c.id, investmentRef: c.investmentRef, status: c.status })),
        actions,
      };
    }),

  forScenario: (scenario, customerId, exceptTxnId) =>
    run(() => {
      const db = getDb();
      const asOf = todayLagos();
      return db.investments
        .filter(
          (i) => i.customerId === customerId && (i.status === 'ACTIVE' || i.status === 'MATURED')
        )
        .map((i) => ({
          ...toRow(db, i, asOf),
          disabledReason: investmentIneligibility(
            scenario,
            i,
            asOf,
            hasOpen(db, i.id, exceptTxnId)
          ),
        }))
        .sort(
          (a, b) =>
            Number(!!a.disabledReason) - Number(!!b.disabledReason) ||
            a.maturityDate.localeCompare(b.maturityDate)
        );
    }),
};

export const httpInvestmentsService: InvestmentsService = {
  list: (q) => http.get('/investments', q as Record<string, unknown>),
  get: (id) => http.get(`/investments/${id}`),
  forScenario: (scenario, customerId, exceptTxnId) =>
    http.get('/investments/eligible', { scenario, customerId, exceptTxnId }),
};

export const investmentsService: InvestmentsService = USE_MOCK
  ? mockInvestmentsService
  : httpInvestmentsService;
