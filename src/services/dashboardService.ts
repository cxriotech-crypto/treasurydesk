/**
 * Dashboard aggregates (brief section 11 "Dashboards"). Every figure is derived from the same
 * records the lists show, so tiles and registers always agree.
 */
import type { RoleCode } from '@/domain/codes';
import { PENDING_APPROVAL_STATUSES, TXN_TYPES, TXN_TYPE_META, levelForRole } from '@/domain/codes';
import { slaState } from '@/domain/rules';
import { accruedInterest } from '@/lib/calc';
import {
  addDays,
  addMonths,
  endOfMonth,
  isoDatePart,
  minutesBetween,
  nowIso,
  startOfMonth,
  todayLagos,
} from '@/lib/dates';
import { monthShort } from '@/lib/format';
import { add, ZERO } from '@/lib/money';
import type { Db } from '@/data/db';
import { getDb } from '@/data/store';
import { findById } from '@/data/repo';
import { USE_MOCK, http, requireUser, run } from './core';
import { aumAsOf } from './reportsService';
import { filterTxns, toTxnRow, type TxnRow } from './transactionsService';
import type { CallbackQueueRow } from './callbacksService';
import type { OpsRow } from './operationsService';
import * as wf from './workflow';

export interface Point {
  label: string;
  value: number;
  /** Exact money string behind the chart value. */
  amount?: string;
}

export interface ToDashboard {
  kind: 'TO';
  drafts: number;
  inVerification: number;
  returned: number;
  awaiting: { count: number; amount: string };
  awaitingConfirmation: number;
  maturitiesToday: { count: number; amount: string };
  maturities30: Point[];
  byTypeThisMonth: Point[];
  recent: TxnRow[];
}

export interface AoDashboard {
  kind: 'AO';
  pending: number;
  confirmedToday: number;
  failedToday: number;
  queue: CallbackQueueRow[];
}

export interface ApproverDashboard {
  kind: 'APPROVER';
  levelLabel: string;
  pending: { count: number; amount: string };
  oldestMinutes: number;
  breaches: number;
  approvedToday: number;
  pipeline: Point[];
  byType: Point[];
  top: TxnRow[];
  /** MD only. */
  aum?: string;
  inflowsThisMonth?: string;
  outflowsThisMonth?: string;
  feeIncomeMtd?: string;
  aumTrend?: Point[];
}

export interface OpsDashboard {
  kind: 'OPS';
  ready: number;
  executedToday: number;
  failures: number;
  toPay: string;
  queue: OpsRow[];
}

export interface AdmDashboard {
  kind: 'ADM';
  activeUsers: number;
  settingChanges: number;
  integrations: { total: number; enabled: number; healthy: number };
  audit: { id: string; summary: string; userName: string; ts: string }[];
}

export type Dashboard = ToDashboard | AoDashboard | ApproverDashboard | OpsDashboard | AdmDashboard;

export interface DashboardService {
  load(): Promise<Dashboard>;
}

function money(rows: { headlineAmt: string }[]): string {
  return add(ZERO, ...rows.map((r) => r.headlineAmt));
}

function toDashboard(db: Db, userId: string): ToDashboard {
  const now = nowIso();
  const today = todayLagos();
  const mine = filterTxns(db, { makerId: userId }, now);
  const live = db.investments.filter((i) => i.status === 'ACTIVE');
  const maturingToday = live.filter((i) => i.maturityDate === today);
  const next30 = live.filter((i) => i.maturityDate > today && i.maturityDate <= addDays(today, 30));
  const buckets: Point[] = [];
  for (let start = 0; start < 30; start += 5) {
    const from = addDays(today, start + 1);
    const to = addDays(today, start + 5);
    const inB = next30.filter((i) => i.maturityDate >= from && i.maturityDate <= to);
    buckets.push({
      label: `${start + 1}–${start + 5}d`,
      value: Number(add(ZERO, ...inB.map((i) => i.principalAmt))),
      amount: add(ZERO, ...inB.map((i) => i.principalAmt)),
    });
  }
  const monthStart = startOfMonth(today);
  const thisMonth = mine.filter((t) => isoDatePart(t.createdAt) >= monthStart);
  return {
    kind: 'TO',
    drafts: mine.filter((t) => t.status === 'DRAFT').length,
    inVerification: mine.filter((t) => t.status === 'VERIFICATION').length,
    returned: mine.filter((t) => t.status === 'RETURNED').length,
    awaiting: {
      count: mine.filter((t) => PENDING_APPROVAL_STATUSES.includes(t.status)).length,
      amount: money(mine.filter((t) => PENDING_APPROVAL_STATUSES.includes(t.status))),
    },
    awaitingConfirmation: mine.filter((t) => t.status === 'EXECUTED').length,
    maturitiesToday: {
      count: maturingToday.length,
      amount: add(ZERO, ...maturingToday.map((i) => i.principalAmt)),
    },
    maturities30: buckets,
    byTypeThisMonth: TXN_TYPES.map((t) => ({
      label: TXN_TYPE_META[t].label,
      value: thisMonth.filter((x) => x.txnType === t).length,
    })),
    recent: mine.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
  };
}

function approverDashboard(db: Db, userId: string, role: RoleCode): ApproverDashboard {
  const now = nowIso();
  const today = todayLagos();
  const level = levelForRole(role)!;
  const queue = filterTxns(db, { status: level.pendingStatus! }, now).map((r) => ({
    ...r,
    waiting: minutesBetween(r.submittedAt ?? r.updatedAt, now),
  }));
  const approvedToday = db.approvals.filter(
    (a) => a.userId === userId && a.action === 'APPROVE' && isoDatePart(a.actedAt) === today
  ).length;
  const pipeline: Point[] = [
    ['In verification', ['DRAFT', 'VERIFICATION', 'RETURNED']],
    ['Head Treasury', ['PENDING_HEAD_TREASURY']],
    ['MIS', ['PENDING_MIS']],
    ['Audit', ['PENDING_AUDIT']],
    ['MD', ['PENDING_MD']],
    ['Operations', ['PENDING_OPERATIONS', 'EXEC_FAILED']],
    ['Confirming', ['EXECUTED']],
  ].map(([label, statuses]) => {
    const rows = db.txns.filter((t) => (statuses as string[]).includes(t.status));
    return { label: label as string, value: rows.length, amount: money(rows) };
  });
  const open = db.txns.filter((t) => wf.LOCKING_STATUSES.includes(t.status));
  const base: ApproverDashboard = {
    kind: 'APPROVER',
    levelLabel: level.label,
    pending: { count: queue.length, amount: money(queue) },
    oldestMinutes: queue.reduce((m, r) => Math.max(m, r.waiting), 0),
    breaches: queue.filter((r) => slaState(r.slaDueAt, now, null)?.breached).length,
    approvedToday,
    pipeline,
    byType: TXN_TYPES.map((t) => ({
      label: TXN_TYPE_META[t].label,
      value: open.filter((x) => x.txnType === t).length,
    })),
    top: queue.sort((a, b) => b.waiting - a.waiting).slice(0, 5),
  };
  if (role !== 'MD') return base;

  // MD extras: AUM, flows and fee income.
  const monthStart = startOfMonth(today);
  const done = db.txns.filter(
    (t) => t.status === 'COMPLETED' && t.completedAt && isoDatePart(t.completedAt) >= monthStart
  );
  let inflows = ZERO;
  let outflows = ZERO;
  let fees = ZERO;
  for (const t of done) {
    for (const v of db.vouchers.filter((x) => x.txnId === t.id)) {
      if (v.voucherType === 'FI') inflows = add(inflows, v.principalAmt);
      if (v.voucherType === 'FO') outflows = add(outflows, v.netAmt);
      fees = add(fees, add(v.chargeAmt, v.feeAmt));
    }
  }
  const trend: Point[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = i === 0 ? today : endOfMonth(addMonths(today, -i));
    const a = aumAsOf(db.investments, d);
    trend.push({ label: monthShort(d), value: Number(a), amount: a });
  }
  return {
    ...base,
    aum: aumAsOf(db.investments, today),
    inflowsThisMonth: inflows,
    outflowsThisMonth: outflows,
    feeIncomeMtd: fees,
    aumTrend: trend,
  };
}

export const mockDashboardService: DashboardService = {
  load: () =>
    run(() => {
      const u = requireUser();
      const db = getDb();
      const now = nowIso();
      const today = todayLagos();
      switch (u.roleCode) {
        case 'TO':
          return toDashboard(db, u.id);
        case 'AO': {
          const logs = db.callbacks.filter((c) => c.officerId === u.id && c.callDate === today);
          const queue = filterTxns(db, { status: ['VERIFICATION', 'RETURNED'] }, now)
            .filter((t) => {
              const ctl = (code: string) =>
                db.controls.find((c) => c.txnId === t.id && c.controlCode === code)?.state;
              return ctl('C02') === 'PASSED' && ctl('C03') !== 'PASSED';
            })
            .map((t) => {
              const list = db.callbacks.filter((c) => c.txnId === t.id);
              return {
                ...t,
                regPhone: findById(db, 'customers', t.customerId)?.regPhone ?? '',
                lastOutcome: list.length ? list[list.length - 1].outcome : null,
                attempts: list.length,
              };
            });
          return {
            kind: 'AO' as const,
            pending: queue.length,
            confirmedToday: logs.filter((l) => l.outcome === 'CONFIRMED').length,
            failedToday: logs.filter((l) => l.outcome !== 'CONFIRMED').length,
            queue: queue.slice(0, 8),
          };
        }
        case 'HT':
        case 'MIS':
        case 'AUD':
        case 'MD':
          return approverDashboard(db, u.id, u.roleCode);
        case 'OPS': {
          const rows = db.txns.filter((t) =>
            ['PENDING_OPERATIONS', 'EXEC_FAILED'].includes(t.status)
          );
          const payout = (id: string) =>
            add(
              ZERO,
              ...db.vouchers
                .filter((v) => v.txnId === id && v.voucherType === 'FO')
                .map((v) => v.netAmt)
            );
          return {
            kind: 'OPS' as const,
            ready: rows.filter((t) => t.status === 'PENDING_OPERATIONS').length,
            executedToday: db.executions.filter(
              (e) => e.status === 'SUCCESS' && isoDatePart(e.executedAt) === today
            ).length,
            failures: rows.filter((t) => t.status === 'EXEC_FAILED').length,
            toPay: add(ZERO, ...rows.map((t) => payout(t.id))),
            queue: rows.slice(0, 8).map((t) => ({
              ...toTxnRow(db, t, now),
              gapsRequired: wf.gapsRequired(db, t),
              attempts: db.executions.filter((e) => e.txnId === t.id).length,
              lastFailure:
                db.executions.filter((e) => e.txnId === t.id && e.status === 'FAILED').pop()
                  ?.failureReason ?? null,
              payoutAmt: payout(t.id),
            })),
          };
        }
        case 'ADM': {
          const weekStart = addDays(today, -7);
          return {
            kind: 'ADM' as const,
            activeUsers: db.users.filter((x) => x.status === 'ACTIVE').length,
            settingChanges: db.audit.filter(
              (e) => e.entity === 'SysSetting' && isoDatePart(e.ts) >= weekStart
            ).length,
            integrations: {
              total: db.integrations.length,
              enabled: db.integrations.filter((i) => i.enabled).length,
              healthy: db.integrations.filter((i) => i.enabled && i.lastTestOk).length,
            },
            audit: db.audit
              .slice(-8)
              .reverse()
              .map((e) => ({
                id: e.id,
                summary: e.summary,
                userName: findById(db, 'users', e.userId)?.fullName ?? 'System',
                ts: e.ts,
              })),
          };
        }
      }
    }),
};

export const httpDashboardService: DashboardService = {
  load: () => http.get('/dashboard'),
};

export const dashboardService: DashboardService = USE_MOCK
  ? mockDashboardService
  : httpDashboardService;

/** Helpers used by the investment register and calendar. */
export function accruedFor(db: Db, investmentId: string, asOf: string): string {
  const inv = findById(db, 'investments', investmentId);
  if (!inv) return ZERO;
  return accruedInterest(inv, asOf, db.settings.values).value;
}
