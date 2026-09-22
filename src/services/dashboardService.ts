// Backend integration point: aggregate queries on Oracle DB
import type { DashboardStats, TreasuryTxn } from '@/types';
import { transactionService } from './transactionService';
import { investmentService } from './investmentService';
import { userService } from './userService';
import { todayLagos, addDays } from '@/lib/format';
import Decimal from 'decimal.js';

const DELAY = 400;

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

export interface ChartDataPoint {
  date: string;
  label: string;
  FD: number;
  TB: number;
  CP: number;
  OD: number;
  FO: number;
  RP: number;
  INFLOW: number;
  ROLLOVER: number;
  MATURITY: number;
  PRELIQ: number;
  ANNIVERSARY: number;
  THIRD_PARTY: number;
  TRANSFER: number;
  total: number;
}

export interface ApprovalFunnelPoint {
  level: string;
  count: number;
  totalAmt: string;
}

export interface MaturityBarPoint {
  date: string;
  label: string;
  amount: number;
  count: number;
}

export interface TxnTypeBarPoint {
  type: string;
  label: string;
  amount: number;
  count: number;
}

export interface AumTrendPoint {
  month: string;
  label: string;
  aum: number;
}

export interface InflowOutflowPoint {
  label: string;
  inflow: number;
  outflow: number;
}

export type DateRange = 'today' | 'week' | 'month' | 'custom';

export interface DateRangeFilter {
  range: DateRange;
  from: string;
  to: string;
}

export function buildDateRange(range: DateRange, customFrom?: string, customTo?: string): DateRangeFilter {
  const today = todayLagos();
  if (range === 'today') return { range, from: today, to: today };
  if (range === 'week') {
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay(); // 0=Sun
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
    const pad = (n: number) => String(n).padStart(2, '0');
    const from = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
    return { range, from, to: today };
  }
  if (range === 'month') {
    const [y, m] = today.split('-').map(Number);
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    return { range, from, to: today };
  }
  // custom
  return { range, from: customFrom ?? today, to: customTo ?? today };
}

// ─── Treasury Officer KPIs ────────────────────────────────────────────────────
export interface TreasuryOfficerStats {
  myDraftsCount: number;
  returnedToMeCount: number;
  awaitingApprovalCount: number;
  awaitingApprovalAmt: string;
  awaitingMyConfirmCount: number;
  awaitingMyConfirmAmt: string;
  maturitiesTodayCount: number;
  maturitiesTodayAmt: string;
}

// ─── Account Officer KPIs ─────────────────────────────────────────────────────
export interface AccountOfficerStats {
  callbacksPendingCount: number;
  completedTodayCount: number;
  failedUnreachableCount: number;
}

// ─── Approver KPIs (Head Treasury, MIS, Audit, MD) ───────────────────────────
export interface ApproverStats {
  pendingMyApprovalCount: number;
  pendingMyApprovalAmt: string;
  oldestItemAgeHHMM: string;
  slaBreachCount: number;
  approvedByMeTodayCount: number;
}

// ─── MD Additional KPIs ───────────────────────────────────────────────────────
export interface MdStats extends ApproverStats {
  totalAum: string;
  inflowsMtd: string;
  outflowsMtd: string;
  penaltyFeeMtd: string;
}

// ─── Operations KPIs ─────────────────────────────────────────────────────────
export interface OperationsStats {
  readyToExecuteCount: number;
  executedTodayCount: number;
  gapsFailuresCount: number;
  totalNairaToPayToday: string;
}

// ─── Admin KPIs ───────────────────────────────────────────────────────────────
export interface AdminStats {
  activeUsersCount: number;
  settingChangesThisWeek: number;
}

export interface AuditFeedEvent {
  id: string;
  action: string;
  entity: string;
  performedBy: string;
  performedAt: string;
  ipAddress: string;
}

function computeOldestAge(txns: TreasuryTxn[]): string {
  if (txns.length === 0) return '00:00';
  const now = Date.now();
  let oldest = 0;
  for (const t of txns) {
    const age = now - new Date(t.initiatedAt).getTime();
    if (age > oldest) oldest = age;
  }
  const totalMins = Math.floor(oldest / 60000);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export const dashboardService = {
  // ─── Legacy compat ──────────────────────────────────────────────────────────
  async getStats(): Promise<DashboardStats> {
    await delay(DELAY);
    const today = todayLagos();
    const { items: all } = await transactionService.list({ pageSize: 9999 });

    const txnsToday = all.filter((t) => t.effectiveDate === today).length;
    const pendingApprovals = all.filter((t) =>
      ['PENDING_HEAD_TREASURY', 'PENDING_MIS', 'PENDING_AUDIT', 'PENDING_MD',
       'PENDING_TO', 'PENDING_HT'].includes(t.status)
    ).length;
    const maturingToday = all.filter((t) => t.maturityDate === today).length;
    const pendingCallbacks = all.filter((t) => t.status === 'VERIFICATION' && !t.callbackDone).length;
    const rejectedToday = all.filter((t) => t.status === 'REJECTED' && t.updatedAt.startsWith(today)).length;
    const pendingOps = all.filter((t) => ['PENDING_OPERATIONS', 'PENDING_OPS'].includes(t.status)).length;

    const activeStatuses = [
      'PENDING_HEAD_TREASURY', 'PENDING_MIS', 'PENDING_AUDIT', 'PENDING_MD',
      'PENDING_OPERATIONS', 'EXECUTED', 'COMPLETED',
      'PENDING_TO', 'PENDING_HT', 'PENDING_OPS', 'CONFIRMED',
    ];
    const totalAum = all
      .filter((t) => activeStatuses.includes(t.status))
      .reduce((acc, t) => acc.plus(new Decimal(t.principalAmt)), new Decimal(0))
      .toFixed(2);

    return { txnsToday, pendingApprovals, maturingToday, totalAum, pendingCallbacks, rejectedToday, pendingOps };
  },

  async getVolumeChart(): Promise<ChartDataPoint[]> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const today = todayLagos();
    const days: ChartDataPoint[] = [];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let i = 6; i >= 0; i--) {
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(y, m - 1, d - i);
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const label = `${String(dt.getDate()).padStart(2, '0')}-${months[dt.getMonth()]}`;
      const dayTxns = all.filter((t) => t.effectiveDate === dateStr);
      days.push({
        date: dateStr, label,
        FD: dayTxns.filter((t) => t.type === 'FD').length,
        TB: dayTxns.filter((t) => t.type === 'TB').length,
        CP: dayTxns.filter((t) => t.type === 'CP').length,
        OD: dayTxns.filter((t) => t.type === 'OD').length,
        FO: dayTxns.filter((t) => t.type === 'FO').length,
        RP: dayTxns.filter((t) => t.type === 'RP').length,
        INFLOW: dayTxns.filter((t) => t.type === 'INFLOW').length,
        ROLLOVER: dayTxns.filter((t) => t.type === 'ROLLOVER').length,
        MATURITY: dayTxns.filter((t) => t.type === 'MATURITY').length,
        PRELIQ: dayTxns.filter((t) => t.type === 'PRELIQ').length,
        ANNIVERSARY: dayTxns.filter((t) => t.type === 'ANNIVERSARY').length,
        THIRD_PARTY: dayTxns.filter((t) => t.type === 'THIRD_PARTY').length,
        TRANSFER: dayTxns.filter((t) => t.type === 'TRANSFER').length,
        total: dayTxns.length,
      });
    }
    return days;
  },

  async getApprovalFunnel(): Promise<ApprovalFunnelPoint[]> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const levels = [
      { level: 'Verification', status: 'VERIFICATION' },
      { level: 'Head Treasury', status: 'PENDING_HEAD_TREASURY' },
      { level: 'MIS', status: 'PENDING_MIS' },
      { level: 'Internal Audit', status: 'PENDING_AUDIT' },
      { level: 'Managing Director', status: 'PENDING_MD' },
      { level: 'Operations', status: 'PENDING_OPERATIONS' },
      { level: 'Completed', status: 'COMPLETED' },
    ];
    return levels.map(({ level, status }) => {
      const txns = all.filter((t) => t.status === status);
      const totalAmt = txns.reduce((acc, t) => acc.plus(new Decimal(t.principalAmt)), new Decimal(0)).toFixed(2);
      return { level, count: txns.length, totalAmt };
    });
  },

  async getMaturingToday(): Promise<TreasuryTxn[]> {
    await delay(DELAY);
    const today = todayLagos();
    const { items } = await transactionService.list({ pageSize: 9999 });
    return items.filter((t) => t.maturityDate === today);
  },

  // ─── Treasury Officer ────────────────────────────────────────────────────────
  async getTreasuryOfficerStats(userId: string, dr: DateRangeFilter): Promise<TreasuryOfficerStats> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const today = todayLagos();

    const inRange = (t: TreasuryTxn) => t.effectiveDate >= dr.from && t.effectiveDate <= dr.to;

    const myDrafts = all.filter((t) => t.initiatedById === userId && t.status === 'DRAFT' && inRange(t));
    const returnedToMe = all.filter((t) => t.initiatedById === userId && t.status === 'RETURNED' && inRange(t));
    const awaitingApproval = all.filter((t) =>
      t.initiatedById === userId &&
      ['PENDING_HEAD_TREASURY', 'PENDING_MIS', 'PENDING_AUDIT', 'PENDING_MD'].includes(t.status) &&
      inRange(t)
    );
    const awaitingConfirm = all.filter((t) =>
      t.initiatedById === userId && t.status === 'EXECUTED' && inRange(t)
    );
    const maturitiesToday = all.filter((t) => t.maturityDate === today && inRange(t));

    const sumAmt = (txns: TreasuryTxn[]) =>
      txns.reduce((acc, t) => acc.plus(new Decimal(t.principalAmt)), new Decimal(0)).toFixed(2);

    return {
      myDraftsCount: myDrafts.length,
      returnedToMeCount: returnedToMe.length,
      awaitingApprovalCount: awaitingApproval.length,
      awaitingApprovalAmt: sumAmt(awaitingApproval),
      awaitingMyConfirmCount: awaitingConfirm.length,
      awaitingMyConfirmAmt: sumAmt(awaitingConfirm),
      maturitiesTodayCount: maturitiesToday.length,
      maturitiesTodayAmt: sumAmt(maturitiesToday),
    };
  },

  async getTreasuryOfficerMaturities30Days(): Promise<MaturityBarPoint[]> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const today = todayLagos();
    const end = addDays(today, 30);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const map = new Map<string, { amount: Decimal; count: number }>();
    for (let i = 0; i <= 30; i++) {
      const d = addDays(today, i);
      map.set(d, { amount: new Decimal(0), count: 0 });
    }
    all.filter((t) => t.maturityDate >= today && t.maturityDate <= end).forEach((t) => {
      const entry = map.get(t.maturityDate);
      if (entry) {
        entry.amount = entry.amount.plus(new Decimal(t.principalAmt));
        entry.count++;
      }
    });
    return Array.from(map.entries()).map(([date, v]) => {
      const [, m, d] = date.split('-').map(Number);
      return { date, label: `${String(d).padStart(2,'0')}-${months[m-1]}`, amount: v.amount.toNumber(), count: v.count };
    });
  },

  async getTxnTypeBarThisMonth(dr: DateRangeFilter): Promise<TxnTypeBarPoint[]> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const types = ['INFLOW', 'ROLLOVER', 'MATURITY', 'PRELIQ', 'ANNIVERSARY', 'THIRD_PARTY', 'TRANSFER'];
    const labels: Record<string, string> = {
      INFLOW: 'New Inflow', ROLLOVER: 'Rollover', MATURITY: 'Maturity',
      PRELIQ: 'Pre-Liq', ANNIVERSARY: 'Anniversary', THIRD_PARTY: '3rd Party', TRANSFER: 'Transfer',
    };
    return types.map((type) => {
      const txns = all.filter((t) => t.type === type && t.effectiveDate >= dr.from && t.effectiveDate <= dr.to);
      const amount = txns.reduce((acc, t) => acc.plus(new Decimal(t.principalAmt)), new Decimal(0)).toNumber();
      return { type, label: labels[type] ?? type, amount, count: txns.length };
    }).filter((p) => p.count > 0);
  },

  // ─── Account Officer ─────────────────────────────────────────────────────────
  async getAccountOfficerStats(dr: DateRangeFilter): Promise<AccountOfficerStats> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const today = todayLagos();
    const callbacksPending = all.filter((t) => t.status === 'VERIFICATION' && !t.callbackDone).length;
    const completedToday = all.filter((t) => t.status === 'COMPLETED' && t.updatedAt.startsWith(today)).length;
    const failedUnreachable = all.filter((t) =>
      t.status === 'VERIFICATION' && !t.callbackDone && t.effectiveDate >= dr.from && t.effectiveDate <= dr.to
    ).length;
    return { callbacksPendingCount: callbacksPending, completedTodayCount: completedToday, failedUnreachableCount: failedUnreachable };
  },

  // ─── Approver (HT, MIS, Audit, MD) ──────────────────────────────────────────
  async getApproverStats(role: string, userId: string, dr: DateRangeFilter): Promise<ApproverStats> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const today = todayLagos();

    const statusMap: Record<string, string> = {
      HEAD_TREASURY: 'PENDING_HEAD_TREASURY',
      MIS: 'PENDING_MIS',
      INTERNAL_AUDIT: 'PENDING_AUDIT',
      MANAGING_DIRECTOR: 'PENDING_MD',
    };
    const myStatus = statusMap[role] ?? 'PENDING_HEAD_TREASURY';
    const pendingMine = all.filter((t) => t.status === myStatus && t.effectiveDate >= dr.from && t.effectiveDate <= dr.to);
    const pendingAmt = pendingMine.reduce((acc, t) => acc.plus(new Decimal(t.principalAmt)), new Decimal(0)).toFixed(2);
    const slaBreaches = pendingMine.filter((t) => t.slaBreached).length;
    const approvedByMeToday = all.filter((t) =>
      t.approvals?.some((a) => a.approverId === userId && a.action === 'APPROVED' && (a.actionAt ?? '').startsWith(today))
    ).length;

    return {
      pendingMyApprovalCount: pendingMine.length,
      pendingMyApprovalAmt: pendingAmt,
      oldestItemAgeHHMM: computeOldestAge(pendingMine),
      slaBreachCount: slaBreaches,
      approvedByMeTodayCount: approvedByMeToday,
    };
  },

  // ─── MD Additional ───────────────────────────────────────────────────────────
  async getMdStats(userId: string, dr: DateRangeFilter): Promise<MdStats> {
    await delay(DELAY);
    const base = await dashboardService.getApproverStats('MANAGING_DIRECTOR', userId, dr);
    const { items: allTxns } = await transactionService.list({ pageSize: 9999 });
    const { items: allInv } = await investmentService.list({ pageSize: 9999 });

    // Total AUM: sum of active investment principals
    const totalAum = allInv
      .filter((i) => i.status === 'ACTIVE')
      .reduce((acc, i) => acc.plus(new Decimal(i.principalAmt)), new Decimal(0))
      .toFixed(2);

    // Inflows vs outflows MTD
    const inflowTypes = ['INFLOW'];
    const outflowTypes = ['MATURITY', 'PRELIQ', 'ANNIVERSARY', 'THIRD_PARTY', 'TRANSFER'];
    const mtdTxns = allTxns.filter((t) => t.effectiveDate >= dr.from && t.effectiveDate <= dr.to && t.status === 'COMPLETED');
    const inflowsMtd = mtdTxns.filter((t) => inflowTypes.includes(t.type))
      .reduce((acc, t) => acc.plus(new Decimal(t.principalAmt)), new Decimal(0)).toFixed(2);
    const outflowsMtd = mtdTxns.filter((t) => outflowTypes.includes(t.type))
      .reduce((acc, t) => acc.plus(new Decimal(t.totalPayout)), new Decimal(0)).toFixed(2);

    // Penalty and fee income MTD (sum of WHT + charges on COMPLETED)
    const penaltyFeeMtd = mtdTxns
      .reduce((acc, t) => acc.plus(new Decimal(t.withholdingTax ?? '0')), new Decimal(0)).toFixed(2);

    return { ...base, totalAum, inflowsMtd, outflowsMtd, penaltyFeeMtd };
  },

  async getInflowOutflowChart(dr: DateRangeFilter): Promise<InflowOutflowPoint[]> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const map = new Map<string, { inflow: Decimal; outflow: Decimal }>();
    for (let i = 1; i <= 12; i++) {
      const key = String(i).padStart(2, '0');
      map.set(key, { inflow: new Decimal(0), outflow: new Decimal(0) });
    }
    all.filter((t) => t.status === 'COMPLETED').forEach((t) => {
      const [, m] = t.effectiveDate.split('-');
      const entry = map.get(m);
      if (!entry) return;
      if (t.type === 'INFLOW') entry.inflow = entry.inflow.plus(new Decimal(t.principalAmt));
      else entry.outflow = entry.outflow.plus(new Decimal(t.totalPayout));
    });
    return Array.from(map.entries()).map(([m, v]) => ({
      label: months[parseInt(m) - 1],
      inflow: v.inflow.toNumber(),
      outflow: v.outflow.toNumber(),
    }));
  },

  async getAumTrend(): Promise<AumTrendPoint[]> {
    await delay(DELAY);
    const { items: allInv } = await investmentService.list({ pageSize: 9999 });
    const today = todayLagos();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const result: AumTrendPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const [y, m] = today.split('-').map(Number);
      const dt = new Date(y, m - 1 - i, 1);
      const monthStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const label = `${months[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`;
      const aum = allInv
        .filter((inv) => inv.effectiveDate.startsWith(monthStr) || inv.status === 'ACTIVE')
        .reduce((acc, inv) => acc.plus(new Decimal(inv.principalAmt)), new Decimal(0))
        .toNumber();
      result.push({ month: monthStr, label, aum });
    }
    return result;
  },

  // ─── Operations ──────────────────────────────────────────────────────────────
  async getOperationsStats(dr: DateRangeFilter): Promise<OperationsStats> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const today = todayLagos();
    const readyToExecute = all.filter((t) => ['PENDING_OPERATIONS', 'PENDING_OPS'].includes(t.status)).length;
    const executedToday = all.filter((t) => t.status === 'EXECUTED' && (t.executedAt ?? '').startsWith(today)).length;
    const gapsFailures = all.filter((t) => t.status === 'EXEC_FAILED').length;
    const totalNairaToPay = all
      .filter((t) => ['PENDING_OPERATIONS', 'PENDING_OPS'].includes(t.status) && t.effectiveDate === today)
      .reduce((acc, t) => acc.plus(new Decimal(t.totalPayout)), new Decimal(0))
      .toFixed(2);
    return { readyToExecuteCount: readyToExecute, executedTodayCount: executedToday, gapsFailuresCount: gapsFailures, totalNairaToPayToday: totalNairaToPay };
  },

  // ─── Admin ───────────────────────────────────────────────────────────────────
  async getAdminStats(): Promise<AdminStats> {
    await delay(DELAY);
    const users = await userService.listAll();
    const activeUsersCount = users.filter((u) => u.isActive).length;
    return { activeUsersCount, settingChangesThisWeek: 7 };
  },

  async getAuditFeed(): Promise<AuditFeedEvent[]> {
    await delay(DELAY);
    const { items: all } = await transactionService.list({ pageSize: 9999 });
    const events: AuditFeedEvent[] = [];
    const actions = ['APPROVED', 'REJECTED', 'RETURNED', 'EXECUTED', 'CREATED', 'UPDATED', 'CONFIRMED', 'DRAFT_SAVED'];
    const officers = ['Adaeze Okonkwo', 'Ibrahim Musa', 'Chiamaka Eze', 'Olumide Adeyemi', 'Folake Adebayo', 'Emeka Nwosu', 'Kelechi Obi', 'Tunde Bakare'];
    all.slice(0, 20).forEach((t, i) => {
      events.push({
        id: `ae-${i}`,
        action: actions[i % actions.length],
        entity: `TXN ${t.ref}`,
        performedBy: officers[i % officers.length],
        performedAt: t.updatedAt,
        ipAddress: `10.0.${Math.floor(i / 10)}.${(i % 10) + 1}`,
      });
    });
    return events.slice(0, 20);
  },

  async getIntegrationHealth() {
    await delay(200);
    return [
      { name: 'CBS (Finacle)', status: 'HEALTHY', latency: '42ms', lastCheck: new Date().toISOString() },
      { name: 'GAPS / RTGS', status: 'HEALTHY', latency: '88ms', lastCheck: new Date().toISOString() },
      { name: 'SWIFT Gateway', status: 'DEGRADED', latency: '340ms', lastCheck: new Date().toISOString() },
      { name: 'Email / Notifications', status: 'HEALTHY', latency: '120ms', lastCheck: new Date().toISOString() },
    ];
  },
};

export { DashboardStats };