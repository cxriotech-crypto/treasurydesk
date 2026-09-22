'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { getSession } from '@/services/userService';
import type { UserRole } from '@/types';
import { buildDateRange } from '@/services/dashboardService';
import type { DateRange, DateRangeFilter } from '@/services/dashboardService';
import { formatDateTime } from '@/lib/format';
import { RefreshCw, Calendar } from 'lucide-react';
import TreasuryOfficerDashboard from './TreasuryOfficerDashboard';
import AccountOfficerDashboard from './AccountOfficerDashboard';
import ApproverDashboard from './ApproverDashboard';
import OperationsDashboard from './OperationsDashboard';
import AdminDashboard from './AdminDashboard';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

export default function DashboardPageClient() {
  const session = getSession();
  const user = session?.user;
  const role = user?.role as UserRole | undefined;

  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [dr, setDr] = useState<DateRangeFilter>(() => buildDateRange('month'));
  const [refreshKey, setRefreshKey] = useState(0);

  const applyRange = useCallback((range: DateRange, from?: string, to?: string) => {
    setDr(buildDateRange(range, from, to));
    setRefreshKey((k) => k + 1);
  }, []);

  function handleRangeChange(range: DateRange) {
    setDateRange(range);
    if (range === 'custom') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      applyRange(range);
    }
  }

  function handleCustomApply() {
    if (customFrom && customTo) {
      applyRange('custom', customFrom, customTo);
      setShowCustom(false);
    }
  }

  if (!user || !role) return null;

  const isApprover = ['HEAD_TREASURY', 'MIS', 'INTERNAL_AUDIT', 'MANAGING_DIRECTOR'].includes(role);

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user.name} · {user.department} · {formatDateTime(new Date().toISOString())}
          </p>
        </div>

        {/* Date Range Picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleRangeChange(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  dateRange === opt.value
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {showCustom && (
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
              <Calendar size={13} className="text-muted-foreground" />
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-xs bg-transparent outline-none text-foreground"
              />
              <span className="text-muted-foreground text-xs">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-xs bg-transparent outline-none text-foreground"
              />
              <button
                onClick={handleCustomApply}
                disabled={!customFrom || !customTo}
                className="btn-primary text-xs px-2 py-1 ml-1"
              >
                Apply
              </button>
            </div>
          )}

          <button
            onClick={() => applyRange(dateRange, customFrom || undefined, customTo || undefined)}
            className="btn-secondary text-xs gap-1.5"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Date range label */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
          Showing: {dr.from === dr.to ? dr.from : `${dr.from} → ${dr.to}`}
        </span>
      </div>

      {/* Role-specific dashboard */}
      {role === 'TREASURY_OFFICER' && (
        <TreasuryOfficerDashboard userId={user.id} dr={dr} refreshKey={refreshKey} />
      )}
      {role === 'ACCOUNT_OFFICER' && (
        <AccountOfficerDashboard dr={dr} refreshKey={refreshKey} />
      )}
      {isApprover && (
        <ApproverDashboard role={role} userId={user.id} dr={dr} refreshKey={refreshKey} />
      )}
      {role === 'OPERATIONS' && (
        <OperationsDashboard dr={dr} refreshKey={refreshKey} />
      )}
      {role === 'SYSTEM_ADMIN' && (
        <AdminDashboard refreshKey={refreshKey} />
      )}
    </AppLayout>
  );
}
