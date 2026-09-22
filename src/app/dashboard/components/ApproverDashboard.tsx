'use client';
import React, { useEffect, useState } from 'react';
import { dashboardService } from '@/services/dashboardService';
import type {
  DateRangeFilter, ApproverStats, MdStats, ApprovalFunnelPoint,
  TxnTypeBarPoint, InflowOutflowPoint, AumTrendPoint
} from '@/services/dashboardService';
import type { TreasuryTxn, UserRole } from '@/types';
import { transactionService } from '@/services/transactionService';
import KpiTile from '@/components/ui/KpiTile';
import { KpiSkeleton, Skeleton } from '@/components/ui/LoadingSkeleton';

import { formatNairaCompact, formatNaira, formatDate } from '@/lib/format';
import { CheckSquare, Clock, AlertTriangle, CheckCircle, TrendingUp, DollarSign, ArrowDownLeft, ArrowUpRight, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';

interface Props { role: UserRole; userId: string; dr: DateRangeFilter; refreshKey: number; }

const STATUS_FOR_ROLE: Record<string, string> = {
  HEAD_TREASURY: 'PENDING_HEAD_TREASURY',
  MIS: 'PENDING_MIS',
  INTERNAL_AUDIT: 'PENDING_AUDIT',
  MANAGING_DIRECTOR: 'PENDING_MD',
};

export default function ApproverDashboard({ role, userId, dr, refreshKey }: Props) {
  const [stats, setStats] = useState<ApproverStats | MdStats | null>(null);
  const [funnelData, setFunnelData] = useState<ApprovalFunnelPoint[]>([]);
  const [txnTypes, setTxnTypes] = useState<TxnTypeBarPoint[]>([]);
  const [inflowOutflow, setInflowOutflow] = useState<InflowOutflowPoint[]>([]);
  const [aumTrend, setAumTrend] = useState<AumTrendPoint[]>([]);
  const [queue, setQueue] = useState<TreasuryTxn[]>([]);
  const [loading, setLoading] = useState(true);

  const isMd = role === 'MANAGING_DIRECTOR';
  const myStatus = STATUS_FOR_ROLE[role] ?? 'PENDING_HEAD_TREASURY';

  useEffect(() => {
    setLoading(true);
    const statsPromise = isMd
      ? dashboardService.getMdStats(userId, dr)
      : dashboardService.getApproverStats(role, userId, dr);

    const promises: Promise<unknown>[] = [
      statsPromise,
      dashboardService.getApprovalFunnel(),
      dashboardService.getTxnTypeBarThisMonth(dr),
      transactionService.list({ pageSize: 5, filters: { status: myStatus }, sort: { field: 'initiatedAt', dir: 'asc' } }),
    ];

    if (isMd) {
      promises.push(dashboardService.getInflowOutflowChart(dr));
      promises.push(dashboardService.getAumTrend());
    }

    Promise.all(promises).then((results) => {
      setStats(results[0] as ApproverStats | MdStats);
      setFunnelData(results[1] as ApprovalFunnelPoint[]);
      setTxnTypes(results[2] as TxnTypeBarPoint[]);
      setQueue((results[3] as { items: TreasuryTxn[] }).items);
      if (isMd) {
        setInflowOutflow(results[4] as InflowOutflowPoint[]);
        setAumTrend(results[5] as AumTrendPoint[]);
      }
    }).finally(() => setLoading(false));
  }, [role, userId, dr, refreshKey]);

  const mdStats = isMd ? (stats as MdStats) : null;

  return (
    <div className="space-y-6">
      {/* KPI Tiles */}
      <div className={`grid grid-cols-2 ${isMd ? 'md:grid-cols-4 xl:grid-cols-8' : 'md:grid-cols-4'} gap-4`}>
        {loading ? Array.from({ length: isMd ? 8 : 4 }).map((_, i) => <KpiSkeleton key={i} />) : stats ? (
          <>
            <Link href={`/my-approvals`} className="block">
              <div title={formatNaira(stats.pendingMyApprovalAmt)}>
                <KpiTile
                  label="Pending My Approval"
                  value={`${stats.pendingMyApprovalCount} · ${formatNairaCompact(stats.pendingMyApprovalAmt)}`}
                  icon={CheckSquare}
                  variant={stats.pendingMyApprovalCount > 0 ? 'warning' : 'success'}
                  subValue="Awaiting your action"
                />
              </div>
            </Link>
            <Link href="/my-approvals" className="block">
              <KpiTile label="Oldest Item Age" value={stats.oldestItemAgeHHMM} icon={Clock} variant={stats.oldestItemAgeHHMM > '04:00' ? 'alert' : 'default'} subValue="hh:mm since initiation" />
            </Link>
            <Link href={`/transactions?slaBreached=true`} className="block">
              <KpiTile label="SLA Breaches" value={stats.slaBreachCount} icon={AlertTriangle} variant={stats.slaBreachCount > 0 ? 'alert' : 'success'} subValue="Items past SLA cutoff" />
            </Link>
            <Link href="/my-approvals" className="block">
              <KpiTile label="Approved by Me Today" value={stats.approvedByMeTodayCount} icon={CheckCircle} variant="success" subValue="Approvals given today" />
            </Link>

            {/* MD-only tiles */}
            {isMd && mdStats && (
              <>
                <div title={formatNaira(mdStats.totalAum)}>
                  <KpiTile label="Total AUM" value={formatNairaCompact(mdStats.totalAum)} icon={TrendingUp} variant="info" subValue="Active investment principal" />
                </div>
                <div title={formatNaira(mdStats.inflowsMtd)}>
                  <KpiTile label="Inflows MTD" value={formatNairaCompact(mdStats.inflowsMtd)} icon={ArrowDownLeft} variant="success" subValue="New placements this period" />
                </div>
                <div title={formatNaira(mdStats.outflowsMtd)}>
                  <KpiTile label="Outflows MTD" value={formatNairaCompact(mdStats.outflowsMtd)} icon={ArrowUpRight} variant="default" subValue="Payouts this period" />
                </div>
                <div title={formatNaira(mdStats.penaltyFeeMtd)}>
                  <KpiTile label="Penalty & Fee MTD" value={formatNairaCompact(mdStats.penaltyFeeMtd)} icon={DollarSign} variant="default" subValue="WHT & charges on completed" />
                </div>
              </>
            )}
          </>
        ) : null}
      </div>

      {/* Charts */}
      <div className={`grid grid-cols-1 ${isMd ? 'xl:grid-cols-3' : 'xl:grid-cols-2'} gap-4`}>
        {/* Pipeline by stage — horizontal funnel */}
        <div className="card p-4">
          <p className="section-header mb-1">Pipeline by Stage</p>
          <p className="text-xs text-muted-foreground mb-4">Transactions at each approval level</p>
          {loading ? <Skeleton className="h-52 w-full" /> : (
            <div className="space-y-2">
              {funnelData.map((item, idx) => {
                const maxCount = Math.max(...funnelData.map((f) => f.count), 1);
                const pct = Math.round((item.count / maxCount) * 100);
                const colors = ['bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500', 'bg-primary', 'bg-green-500', 'bg-emerald-500'];
                return (
                  <div key={item.level} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">{item.level}</span>
                    <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-full ${colors[idx % colors.length]} rounded-full flex items-center justify-end pr-2 transition-all duration-500`}
                        style={{ width: `${Math.max(pct, 8)}%` }}
                      >
                        <span className="text-white text-[10px] font-bold">{item.count}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right shrink-0" title={formatNaira(item.totalAmt)}>
                      {formatNairaCompact(item.totalAmt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Volume by transaction type */}
        <div className="card p-4">
          <p className="section-header mb-1">Volume by Transaction Type</p>
          <p className="text-xs text-muted-foreground mb-4">Principal (₦) for selected period</p>
          {loading ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={txnTypes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNairaCompact(v)} width={70} />
                <Tooltip formatter={(v: number) => [formatNaira(v), 'Amount']} />
                <Bar dataKey="amount" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* MD: Inflows vs Outflows */}
        {isMd && (
          <div className="card p-4">
            <p className="section-header mb-1">Inflows vs Outflows</p>
            <p className="text-xs text-muted-foreground mb-4">Monthly comparison (₦)</p>
            {loading ? <Skeleton className="h-52 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={inflowOutflow} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNairaCompact(v)} width={70} />
                  <Tooltip formatter={(v: number) => [formatNaira(v)]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="inflow" name="Inflows" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="outflow" name="Outflows" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* MD: AUM Trend */}
      {isMd && (
        <div className="card p-4">
          <p className="section-header mb-1">AUM Trend — Last 12 Months</p>
          <p className="text-xs text-muted-foreground mb-4">Total active investment principal (₦)</p>
          {loading ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={aumTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNairaCompact(v)} width={70} />
                <Tooltip formatter={(v: number) => [formatNaira(v), 'AUM']} />
                <Line type="monotone" dataKey="aum" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* My Queue Top 5 */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-header">My Queue — Top 5</p>
          <Link href="/my-approvals" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight size={11} />
          </Link>
        </div>
        {loading ? <Skeleton className="h-40 w-full" /> : queue.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Your queue is empty. ✓</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Ref</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Customer</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Amount</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Date</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">SLA</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-3 font-mono text-xs text-primary">{t.ref}</td>
                    <td className="py-2 px-3 text-xs">{t.customerName}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{t.type}</td>
                    <td className="py-2 px-3 text-xs text-right font-mono" title={formatNaira(t.principalAmt)}>
                      {formatNairaCompact(t.principalAmt)}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{formatDate(t.effectiveDate)}</td>
                    <td className="py-2 px-3">
                      {t.slaBreached ? (
                        <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Breached</span>
                      ) : (
                        <span className="text-xs text-green-600">OK</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <Link href="/my-approvals" className="px-2.5 py-1 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors">
                          Approve
                        </Link>
                        <Link href={`/transactions?ref=${t.ref}`} className="px-2.5 py-1 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors">
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
