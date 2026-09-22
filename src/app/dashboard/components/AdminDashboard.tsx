'use client';
import React, { useEffect, useState } from 'react';
import { dashboardService } from '@/services/dashboardService';
import type { AdminStats, AuditFeedEvent } from '@/services/dashboardService';
import KpiTile from '@/components/ui/KpiTile';
import { KpiSkeleton, Skeleton } from '@/components/ui/LoadingSkeleton';
import { formatDateTime } from '@/lib/format';
import { Users, Settings, CheckCircle, AlertTriangle, XCircle, Activity } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface Props { refreshKey: number; }

interface IntegrationHealth {
  name: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  latency: string;
  lastCheck: string;
}

const STATUS_CONFIG = {
  HEALTHY: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Healthy' },
  DEGRADED: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'Degraded' },
  DOWN: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Down' },
};

const ACTION_COLORS: Record<string, string> = {
  APPROVED: 'text-green-600 bg-green-50',
  REJECTED: 'text-red-600 bg-red-50',
  RETURNED: 'text-amber-600 bg-amber-50',
  EXECUTED: 'text-blue-600 bg-blue-50',
  CREATED: 'text-purple-600 bg-purple-50',
  UPDATED: 'text-teal-600 bg-teal-50',
  CONFIRMED: 'text-green-600 bg-green-50',
  DRAFT_SAVED: 'text-muted-foreground bg-muted',
};

export default function AdminDashboard({ refreshKey }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationHealth[]>([]);
  const [auditFeed, setAuditFeed] = useState<AuditFeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      dashboardService.getAdminStats(),
      dashboardService.getIntegrationHealth(),
      dashboardService.getAuditFeed(),
    ]).then(([s, integs, feed]) => {
      setStats(s);
      setIntegrations(integs as IntegrationHealth[]);
      setAuditFeed(feed);
    }).finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <div className="space-y-6">
      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4 max-w-md">
        {loading ? Array.from({ length: 2 }).map((_, i) => <KpiSkeleton key={i} />) : stats ? (
          <>
            <KpiTile label="Active Users" value={stats.activeUsersCount} icon={Users} variant="info" subValue="Currently active accounts" />
            <KpiTile label="Setting Changes" value={stats.settingChangesThisWeek} icon={Settings} variant="default" subValue="This week" />
          </>
        ) : null}
      </div>

      {/* Integration Health */}
      <div>
        <p className="section-header mb-3">Integration Health</p>
        {loading ? <Skeleton className="h-32 w-full" /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {integrations.map((integ) => {
              const cfg = STATUS_CONFIG[integ.status] ?? STATUS_CONFIG.DOWN;
              const Icon = cfg.icon;
              return (
                <div key={integ.name} className={`rounded-xl border p-4 ${cfg.bg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-foreground">{integ.name}</p>
                    <Icon size={16} className={cfg.color} />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{integ.latency}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Last check: {formatDateTime(integ.lastCheck)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Audit Feed */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-primary" />
          <p className="section-header">Live Audit Feed</p>
          <span className="ml-auto text-xs text-muted-foreground">Last 20 events</span>
        </div>
        {loading ? <Skeleton className="h-64 w-full" /> : auditFeed.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No audit events found.</p>
        ) : (
          <div className="space-y-1 max-h-[480px] overflow-y-auto">
            {auditFeed.map((event) => {
              const colorClass = ACTION_COLORS[event.action] ?? 'text-muted-foreground bg-muted';
              return (
                <div key={event.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${colorClass}`}>
                    {event.action}
                  </span>
                  <span className="text-xs font-mono text-foreground shrink-0">{event.entity}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1">by {event.performedBy}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(event.performedAt)}</span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{event.ipAddress}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
