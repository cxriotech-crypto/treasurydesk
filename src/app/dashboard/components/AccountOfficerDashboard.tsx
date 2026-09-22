'use client';
import React, { useEffect, useState } from 'react';
import { dashboardService } from '@/services/dashboardService';
import type { DateRangeFilter, AccountOfficerStats } from '@/services/dashboardService';
import type { TreasuryTxn } from '@/types';
import { transactionService } from '@/services/transactionService';
import KpiTile from '@/components/ui/KpiTile';
import { KpiSkeleton, Skeleton } from '@/components/ui/LoadingSkeleton';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/format';
import { Phone, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface Props { dr: DateRangeFilter; refreshKey: number; }

export default function AccountOfficerDashboard({ dr, refreshKey }: Props) {
  const [stats, setStats] = useState<AccountOfficerStats | null>(null);
  const [callbackQueue, setCallbackQueue] = useState<TreasuryTxn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      dashboardService.getAccountOfficerStats(dr),
      transactionService.list({ pageSize: 20, filters: { status: 'VERIFICATION' } }),
    ]).then(([s, queue]) => {
      setStats(s);
      setCallbackQueue(queue.items.filter((t) => !t.callbackDone));
    }).finally(() => setLoading(false));
  }, [dr, refreshKey]);

  return (
    <div className="space-y-6">
      {/* KPI Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? Array.from({ length: 3 }).map((_, i) => <KpiSkeleton key={i} />) : stats ? (
          <>
            <Link href="/transactions?status=VERIFICATION" className="block">
              <KpiTile label="Call-backs Pending" value={stats.callbacksPendingCount} icon={Phone} variant={stats.callbacksPendingCount > 0 ? 'warning' : 'success'} subValue="Awaiting customer confirmation" />
            </Link>
            <Link href="/transactions?status=COMPLETED" className="block">
              <KpiTile label="Completed Today" value={stats.completedTodayCount} icon={CheckCircle} variant="success" subValue="Transactions completed today" />
            </Link>
            <Link href="/transactions?status=VERIFICATION" className="block">
              <KpiTile label="Failed / Unreachable" value={stats.failedUnreachableCount} icon={XCircle} variant={stats.failedUnreachableCount > 0 ? 'alert' : 'success'} subValue="No answer / disputed" />
            </Link>
          </>
        ) : null}
      </div>

      {/* Call-back Queue */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-header">Call-back Queue</p>
          <Link href="/transactions?status=VERIFICATION" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight size={11} />
          </Link>
        </div>
        {loading ? <Skeleton className="h-48 w-full" /> : callbackQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No pending call-backs. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Ref</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Customer</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Date</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {callbackQueue.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-3 font-mono text-xs text-primary">{t.ref}</td>
                    <td className="py-2 px-3 text-xs">{t.customerName}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{t.type}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{formatDate(t.effectiveDate)}</td>
                    <td className="py-2 px-3"><StatusBadge status={t.status} /></td>
                    <td className="py-2 px-3">
                      <Link
                        href={`/transactions?ref=${t.ref}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                      >
                        <Phone size={11} />
                        Call now
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
