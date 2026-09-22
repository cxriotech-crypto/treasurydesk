'use client';
import React, { useEffect, useState } from 'react';
import { dashboardService } from '@/services/dashboardService';
import type { DateRangeFilter, TreasuryOfficerStats, MaturityBarPoint, TxnTypeBarPoint } from '@/services/dashboardService';
import type { TreasuryTxn } from '@/types';
import { transactionService } from '@/services/transactionService';
import KpiTile from '@/components/ui/KpiTile';
import { KpiSkeleton, Skeleton } from '@/components/ui/LoadingSkeleton';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatNairaCompact, formatNaira, formatDate } from '@/lib/format';
import { FileText, RotateCcw, CheckSquare, Zap, TrendingUp, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props { userId: string; dr: DateRangeFilter; refreshKey: number; }

function NairaTooltip({ value, label }: { value: string | number; label: string }) {
  return (
    <div title={formatNaira(value)} className="cursor-help border-b border-dashed border-current">
      {label}
    </div>
  );
}

export default function TreasuryOfficerDashboard({ userId, dr, refreshKey }: Props) {
  const [stats, setStats] = useState<TreasuryOfficerStats | null>(null);
  const [maturities, setMaturities] = useState<MaturityBarPoint[]>([]);
  const [txnTypes, setTxnTypes] = useState<TxnTypeBarPoint[]>([]);
  const [recentTxns, setRecentTxns] = useState<TreasuryTxn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      dashboardService.getTreasuryOfficerStats(userId, dr),
      dashboardService.getTreasuryOfficerMaturities30Days(),
      dashboardService.getTxnTypeBarThisMonth(dr),
      transactionService.list({ pageSize: 10, sort: { field: 'initiatedAt', dir: 'desc' }, filters: { initiatedById: userId } }),
    ]).then(([s, mat, types, recent]) => {
      setStats(s);
      setMaturities(mat.filter((m) => m.count > 0));
      setTxnTypes(types);
      setRecentTxns(recent.items);
    }).finally(() => setLoading(false));
  }, [userId, dr, refreshKey]);

  return (
    <div className="space-y-6">
      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {loading ? Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />) : stats ? (
          <>
            <Link href="/transactions?status=DRAFT" className="block">
              <KpiTile label="My Drafts" value={stats.myDraftsCount} icon={FileText} variant="default" subValue="Unsent transactions" />
            </Link>
            <Link href="/transactions?status=RETURNED" className="block">
              <KpiTile label="Returned to Me" value={stats.returnedToMeCount} icon={RotateCcw} variant={stats.returnedToMeCount > 0 ? 'warning' : 'success'} subValue="Needs correction" />
            </Link>
            <Link href="/transactions?status=PENDING_HEAD_TREASURY" className="block">
              <div title={formatNaira(stats.awaitingApprovalAmt)}>
                <KpiTile
                  label="Awaiting Approval"
                  value={`${stats.awaitingApprovalCount} · ${formatNairaCompact(stats.awaitingApprovalAmt)}`}
                  icon={CheckSquare}
                  variant={stats.awaitingApprovalCount > 0 ? 'info' : 'success'}
                  subValue="In approval pipeline"
                />
              </div>
            </Link>
            <Link href="/transactions?status=EXECUTED" className="block">
              <div title={formatNaira(stats.awaitingMyConfirmAmt)}>
                <KpiTile
                  label="Awaiting Confirmation"
                  value={`${stats.awaitingMyConfirmCount} · ${formatNairaCompact(stats.awaitingMyConfirmAmt)}`}
                  icon={Zap}
                  variant={stats.awaitingMyConfirmCount > 0 ? 'warning' : 'success'}
                  subValue="Executed, pending confirm"
                />
              </div>
            </Link>
            <Link href="/investments?maturityDate=today" className="block">
              <div title={formatNaira(stats.maturitiesTodayAmt)}>
                <KpiTile
                  label="Maturities Today"
                  value={`${stats.maturitiesTodayCount} · ${formatNairaCompact(stats.maturitiesTodayAmt)}`}
                  icon={TrendingUp}
                  variant={stats.maturitiesTodayCount > 0 ? 'alert' : 'success'}
                  subValue="Investments due today"
                />
              </div>
            </Link>
          </>
        ) : null}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Maturities next 30 days */}
        <div className="card p-4">
          <p className="section-header mb-1">Maturities — Next 30 Days</p>
          <p className="text-xs text-muted-foreground mb-4">Principal value (₦) by day</p>
          {loading ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={maturities} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNairaCompact(v)} width={70} />
                <Tooltip formatter={(v: number) => [formatNaira(v), 'Principal']} />
                <Bar dataKey="amount" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Transactions by type this month */}
        <div className="card p-4">
          <p className="section-header mb-1">Transactions by Type</p>
          <p className="text-xs text-muted-foreground mb-4">Volume (₦) for selected period</p>
          {loading ? <Skeleton className="h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={txnTypes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNairaCompact(v)} width={70} />
                <Tooltip formatter={(v: number) => [formatNaira(v), 'Amount']} />
                <Bar dataKey="amount" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-header">My 10 Most Recent Transactions</p>
          <Link href="/transactions" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight size={11} />
          </Link>
        </div>
        {loading ? <Skeleton className="h-40 w-full" /> : recentTxns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No transactions found.</p>
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
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTxns.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-3">
                      <Link href={`/transactions?ref=${t.ref}`} className="text-primary hover:underline font-mono text-xs">{t.ref}</Link>
                    </td>
                    <td className="py-2 px-3 text-xs text-foreground">{t.customerName}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{t.type}</td>
                    <td className="py-2 px-3 text-xs text-right font-mono" title={formatNaira(t.principalAmt)}>
                      {formatNairaCompact(t.principalAmt)}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{formatDate(t.effectiveDate)}</td>
                    <td className="py-2 px-3"><StatusBadge status={t.status} /></td>
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
