'use client';
import React, { useEffect, useState } from 'react';
import { dashboardService } from '@/services/dashboardService';
import type { DateRangeFilter, OperationsStats } from '@/services/dashboardService';
import type { TreasuryTxn } from '@/types';
import { transactionService } from '@/services/transactionService';
import KpiTile from '@/components/ui/KpiTile';
import { KpiSkeleton, Skeleton } from '@/components/ui/LoadingSkeleton';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatNairaCompact, formatNaira, formatDate } from '@/lib/format';
import { Zap, CheckCircle, AlertTriangle, DollarSign, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface Props { dr: DateRangeFilter; refreshKey: number; }

export default function OperationsDashboard({ dr, refreshKey }: Props) {
  const [stats, setStats] = useState<OperationsStats | null>(null);
  const [execQueue, setExecQueue] = useState<TreasuryTxn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      dashboardService.getOperationsStats(dr),
      transactionService.list({ pageSize: 20, filters: { status: ['PENDING_OPERATIONS', 'PENDING_OPS'] }, sort: { field: 'initiatedAt', dir: 'asc' } }),
    ]).then(([s, queue]) => {
      setStats(s);
      setExecQueue(queue.items);
    }).finally(() => setLoading(false));
  }, [dr, refreshKey]);

  return (
    <div className="space-y-6">
      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />) : stats ? (
          <>
            <Link href="/operations-queue" className="block">
              <KpiTile label="Ready to Execute" value={stats.readyToExecuteCount} icon={Zap} variant={stats.readyToExecuteCount > 0 ? 'warning' : 'success'} subValue="Approved, awaiting execution" />
            </Link>
            <Link href="/operations-queue?status=EXECUTED" className="block">
              <KpiTile label="Executed Today" value={stats.executedTodayCount} icon={CheckCircle} variant="success" subValue="Processed today" />
            </Link>
            <Link href="/operations-queue?status=EXEC_FAILED" className="block">
              <KpiTile label="GAPS Failures" value={stats.gapsFailuresCount} icon={AlertTriangle} variant={stats.gapsFailuresCount > 0 ? 'alert' : 'success'} subValue="Execution failures" />
            </Link>
            <div title={formatNaira(stats.totalNairaToPayToday)}>
              <KpiTile label="Total ₦ to Pay Today" value={formatNairaCompact(stats.totalNairaToPayToday)} icon={DollarSign} variant="info" subValue="Pending ops, effective today" />
            </div>
          </>
        ) : null}
      </div>

      {/* Execution Queue */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-header">Execution Queue</p>
          <Link href="/operations-queue" className="text-xs text-primary hover:underline flex items-center gap-1">
            Open queue <ArrowRight size={11} />
          </Link>
        </div>
        {loading ? <Skeleton className="h-48 w-full" /> : execQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Execution queue is empty. ✓</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Ref</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Customer</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Payout</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Value Date</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {execQueue.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-3 font-mono text-xs text-primary">{t.ref}</td>
                    <td className="py-2 px-3 text-xs">{t.customerName}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{t.type}</td>
                    <td className="py-2 px-3 text-xs text-right font-mono" title={formatNaira(t.totalPayout)}>
                      {formatNairaCompact(t.totalPayout)}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{formatDate(t.effectiveDate)}</td>
                    <td className="py-2 px-3"><StatusBadge status={t.status} /></td>
                    <td className="py-2 px-3">
                      <Link href="/operations-queue" className="px-2.5 py-1 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors">
                        Execute
                      </Link>
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
