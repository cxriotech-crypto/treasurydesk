'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import KpiTile from '@/components/ui/KpiTile';
import { KpiSkeleton, Skeleton } from '@/components/ui/LoadingSkeleton';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { dashboardService } from '@/services/dashboardService';
import { transactionService } from '@/services/transactionService';
import { resetTransactions } from '@/services/transactionService';
import type { DashboardStats, ChartDataPoint, ApprovalFunnelPoint } from '@/services/dashboardService';
import type { TreasuryTxn } from '@/types';
import { formatNairaCompact, formatNaira, formatDate, formatDateTime } from '@/lib/format';
import {
  FileText, Clock, CheckSquare, TrendingUp, AlertCircle,
  Phone, XCircle, Zap, RefreshCw, RotateCcw, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import VolumeChart from './VolumeChart';
import ApprovalFunnelChart from './ApprovalFunnelChart';

export default function DashboardClient() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [volumeData, setVolumeData] = useState<ChartDataPoint[]>([]);
  const [funnelData, setFunnelData] = useState<ApprovalFunnelPoint[]>([]);
  const [recentTxns, setRecentTxns] = useState<TreasuryTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cutoffSeconds, setCutoffSeconds] = useState(0);
  const [resetting, setResetting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, vol, funnel, recent] = await Promise.all([
        dashboardService.getStats(),
        dashboardService.getVolumeChart(),
        dashboardService.getApprovalFunnel(),
        transactionService.list({ pageSize: 8, sort: { field: 'initiatedAt', dir: 'desc' } }),
      ]);
      setStats(s);
      setVolumeData(vol);
      setFunnelData(funnel);
      setRecentTxns(recent.items);
    } catch {
      setError('Failed to load dashboard data. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Cut-off countdown (3:00 PM Lagos = 15:00)
  useEffect(() => {
    function calcCutoff() {
      const now = new Date();
      const lagosOffset = 60;
      const lagosMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
      const lagos = new Date(lagosMs);
      const cutoff = new Date(lagosMs);
      cutoff.setHours(15, 0, 0, 0);
      const diff = Math.max(0, Math.floor((cutoff.getTime() - lagos.getTime()) / 1000));
      setCutoffSeconds(diff);
    }
    calcCutoff();
    const id = setInterval(calcCutoff, 1000);
    return () => clearInterval(id);
  }, []);

  async function handleReset() {
    setResetting(true);
    try {
      resetTransactions();
      await fetchAll();
      toast.success('Demo data has been reset to seed state.');
    } catch {
      toast.error('Reset failed. Please try again.');
    } finally {
      setResetting(false);
    }
  }

  const cutoffHours = Math.floor(cutoffSeconds / 3600);
  const cutoffMins = Math.floor((cutoffSeconds % 3600) / 60);
  const cutoffSecs = cutoffSeconds % 60;
  const cutoffStr = cutoffSeconds <= 0
    ? 'Cut-off Passed'
    : `${String(cutoffHours).padStart(2, '0')}:${String(cutoffMins).padStart(2, '0')}:${String(cutoffSecs).padStart(2, '0')}`;
  const isUrgent = cutoffSeconds > 0 && cutoffSeconds < 3600;
  const isCutoffPassed = cutoffSeconds <= 0;

  const APPROVAL_LEVEL_COLORS: Record<string, string> = {
    'Treasury Officer': 'bg-blue-100 text-blue-700',
    'Head Treasury': 'bg-purple-100 text-purple-700',
    'MIS': 'bg-teal-100 text-teal-700',
    'Internal Audit': 'bg-orange-100 text-orange-700',
    'Managing Director': 'bg-primary/10 text-primary',
  };

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            First Marina Trust Finance — Treasury Operations • {formatDateTime(new Date().toISOString())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="btn-secondary text-xs gap-1.5"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="btn-ghost text-xs gap-1.5 text-muted-foreground"
          >
            <RotateCcw size={12} />
            Reset Demo
          </button>
          <Link href="/new-transaction" className="btn-accent text-xs gap-1.5">
            <FileText size={12} />
            New Transaction
          </Link>
        </div>
      </div>

      {/* Cut-off alert banner */}
      {(isUrgent || isCutoffPassed) && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-5 ${isCutoffPassed ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200 cut-off-urgent'}`}>
          <AlertCircle size={16} className={isCutoffPassed ? 'text-red-600' : 'text-amber-600'} />
          <p className={`text-sm font-semibold ${isCutoffPassed ? 'text-red-700' : 'text-amber-700'}`}>
            {isCutoffPassed
              ? 'Cut-off time has passed (15:00 WAT) — no new transactions can be executed today.'
              : `Cut-off alert: Less than 1 hour to the 15:00 WAT execution cut-off. ${stats?.pendingOps ?? 0} transaction(s) still pending operations.`}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-red-50 border-red-200 mb-5">
          <AlertCircle size={16} className="text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchAll} className="ml-auto btn-secondary text-xs">Retry</button>
        </div>
      )}

      {/* KPI Bento Grid — 4 cols, 2 rows = 7 cards + 1 wide */}
      {/* Plan: row1: 4 cards; row2: 3 cards + 1 spanning 1 col */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 7 }).map((_, i) => <KpiSkeleton key={`kpi-skel-${i}`} />)
        ) : stats ? (
          <>
            <KpiTile
              label="Transactions Today"
              value={stats.txnsToday}
              icon={FileText}
              subValue="Initiated since midnight"
              variant="default"
            />
            <KpiTile
              label="Pending Approvals"
              value={stats.pendingApprovals}
              icon={CheckSquare}
              subValue="Across all 5 approval levels"
              variant={stats.pendingApprovals > 5 ? 'warning' : 'info'}
            />
            <KpiTile
              label="Maturing Today"
              value={stats.maturingToday}
              icon={TrendingUp}
              subValue="Investments due today"
              variant={stats.maturingToday > 0 ? 'warning' : 'success'}
            />
            <KpiTile
              label="Total AUM"
              value={formatNairaCompact(stats.totalAum)}
              icon={TrendingUp}
              subValue={formatNaira(stats.totalAum)}
              variant="default"
            />
            <KpiTile
              label="Cut-off Countdown"
              value={cutoffStr}
              icon={Clock}
              subValue="Daily execution cut-off 15:00 WAT"
              variant={isCutoffPassed ? 'alert' : isUrgent ? 'warning' : 'default'}
            />
            <KpiTile
              label="Pending Callbacks"
              value={stats.pendingCallbacks}
              icon={Phone}
              subValue="Awaiting customer confirmation"
              variant={stats.pendingCallbacks > 0 ? 'warning' : 'success'}
            />
            <KpiTile
              label="Rejected Today"
              value={stats.rejectedToday}
              icon={XCircle}
              subValue="Requires re-initiation"
              variant={stats.rejectedToday > 0 ? 'alert' : 'success'}
            />
            <KpiTile
              label="Pending Ops Execution"
              value={stats.pendingOps}
              icon={Zap}
              subValue="Approved — awaiting execution"
              variant={stats.pendingOps > 0 ? 'warning' : 'success'}
            />
          </>
        ) : null}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-3 gap-4 mb-6">
        {/* Volume Chart — 2/3 width */}
        <div className="xl:col-span-2 card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="section-header">Transaction Volume — Last 7 Days</p>
              <p className="text-xs text-muted-foreground mt-0.5">By instrument type</p>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">Count</span>
          </div>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <VolumeChart data={volumeData} />
          )}
        </div>

        {/* Approval Funnel — 1/3 width */}
        <div className="card p-4">
          <div className="mb-4">
            <p className="section-header">Approval Pipeline</p>
            <p className="text-xs text-muted-foreground mt-0.5">Transactions pending at each level</p>
          </div>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ApprovalFunnelChart data={funnelData} />
          )}
          {/* Level breakdown */}
          {!loading && funnelData.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {funnelData.map((f) => (
                <div key={`funnel-label-${f.level}`} className="flex items-center justify-between">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${APPROVAL_LEVEL_COLORS[f.level] ?? 'bg-muted text-muted-foreground'}`}>
                    {f.level}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-foreground">{f.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Recent Transactions */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="section-header">Recent Transactions</p>
            <p className="text-xs text-muted-foreground mt-0.5">Latest 8 treasury transactions</p>
          </div>
          <Link href="/transactions" className="text-xs text-accent font-semibold flex items-center gap-1 hover:underline">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {loading ? (
          <div className="p-4">
            <Skeleton className="h-6 w-full mb-2" />
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={`recent-skel-${i}`} className="h-10 w-full mb-1" />)}
          </div>
        ) : recentTxns.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Initiated treasury transactions will appear here."
            action={<Link href="/new-transaction" className="btn-primary text-xs">Initiate Transaction</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-secondary border-b border-border">
                  {['Ref', 'Customer', 'Type', 'Principal', 'Rate', 'Tenor', 'Maturity', 'Status', 'Initiated'].map((h) => (
                    <th key={`dash-th-${h}`} className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTxns.map((txn, i) => (
                  <tr
                    key={`dash-row-${txn.id}`}
                    className={`border-b border-border hover:bg-accent/5 cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-background/50'}`}
                    onClick={() => window.location.href = `/transactions`}
                  >
                    <td className="px-3 py-2.5 text-xs font-mono text-accent font-semibold">{txn.ref}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-foreground max-w-[160px] truncate">{txn.customerName}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{txn.type}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-right font-semibold text-foreground">{formatNairaCompact(txn.principalAmt)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-right">{txn.intRate}%</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-right">{txn.tenorDays}d</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDate(txn.maturityDate)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={txn.status} size="sm" /></td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDateTime(txn.initiatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}