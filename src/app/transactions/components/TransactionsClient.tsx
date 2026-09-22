'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import DataTable, { ColumnDef } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import Drawer from '@/components/ui/Drawer';
import { transactionService } from '@/services/transactionService';
import type { TreasuryTxn, TxnStatus, TxnType } from '@/types';
import { TXN_TYPE_LABELS, APPROVAL_LEVEL_LABELS, STATUS_LABELS } from '@/types';
import { formatNaira, formatNairaCompact, formatDate, formatDateTime } from '@/lib/format';
import { Filter, X, CheckCircle2, Clock } from 'lucide-react';
import { todayLagos } from '@/lib/format';
import Stepper from '@/components/ui/Stepper';

const STATUS_OPTIONS: TxnStatus[] = [
  'DRAFT', 'PENDING_VERIFY', 'PENDING_CALLBACK', 'PENDING_CBS', 'PENDING_VOUCHER',
  'PENDING_TO', 'PENDING_HT', 'PENDING_MIS', 'PENDING_AUDIT', 'PENDING_MD',
  'PENDING_OPS', 'EXECUTED', 'CONFIRMED', 'CLOSED', 'STOPPED', 'REJECTED',
];

const TYPE_OPTIONS: TxnType[] = ['FO', 'FD', 'TB', 'CP', 'RP', 'OD'];

export default function TransactionsClient() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<TreasuryTxn[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState<string>('initiatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTxn, setSelectedTxn] = useState<TreasuryTxn | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [successToast, setSuccessToast] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Show success toast from wizard redirect
  useEffect(() => {
    if (searchParams.get('submitted') === '1') {
      setSuccessToast('Transaction submitted successfully. Pending Head Treasury approval.');
      setTimeout(() => setSuccessToast(''), 5000);
    }
    if (searchParams.get('stopped') === '1') {
      setSuccessToast('Transaction stopped — signature mismatch recorded.');
      setTimeout(() => setSuccessToast(''), 5000);
    }
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await transactionService.list({
        page,
        pageSize,
        sort: { field: sortField, dir: sortDir },
        filters: {
          search: search || undefined,
          status: filterStatus || undefined,
          type: filterType || undefined,
          dateFrom: filterDateFrom || undefined,
          dateTo: filterDateTo || undefined,
        },
      });
      setData(result.items);
      setTotal(result.total);
    } catch {
      setError('Failed to load transactions. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortField, sortDir, search, filterStatus, filterType, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSort(field: string, dir: 'asc' | 'desc') {
    setSortField(field);
    setSortDir(dir);
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setFilterStatus('');
    setFilterType('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(1);
  }

  const hasActiveFilters = search || filterStatus || filterType || filterDateFrom || filterDateTo;

  const COLUMNS: ColumnDef<TreasuryTxn & Record<string, unknown>>[] = [
    {
      key: 'ref', header: 'Ref', sortable: true, width: 'w-36',
      render: (v) => <span className="font-mono text-xs text-accent font-semibold">{String(v)}</span>,
    },
    {
      key: 'customerName', header: 'Customer', sortable: true,
      render: (v, row) => (
        <div>
          <p className="text-xs font-semibold text-foreground truncate max-w-[160px]">{String(v)}</p>
          <p className="text-[10px] text-muted-foreground">{row.customerCif as string}</p>
        </div>
      ),
    },
    {
      key: 'type', header: 'Type', sortable: true, width: 'w-20',
      render: (v) => (
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{String(v)}</span>
      ),
    },
    {
      key: 'principalAmt', header: 'Principal', sortable: true, align: 'right',
      render: (v) => <span className="text-xs font-semibold tabular-nums text-foreground">{formatNairaCompact(String(v))}</span>,
    },
    {
      key: 'intRate', header: 'Rate', sortable: true, align: 'right', width: 'w-16',
      render: (v) => <span className="text-xs tabular-nums">{String(v)}%</span>,
    },
    {
      key: 'tenorDays', header: 'Tenor', sortable: true, align: 'right', width: 'w-16',
      render: (v) => <span className="text-xs tabular-nums">{String(v)}d</span>,
    },
    {
      key: 'effectiveDate', header: 'Eff. Date', sortable: true,
      render: (v) => <span className="text-xs text-muted-foreground">{formatDate(String(v))}</span>,
    },
    {
      key: 'maturityDate', header: 'Maturity', sortable: true,
      render: (v) => {
        const isToday = String(v) === todayLagos();
        return <span className={`text-xs ${isToday ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>{formatDate(String(v))}</span>;
      },
    },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (v) => <StatusBadge status={v as TxnStatus} size="sm" />,
    },
    {
      key: 'currentApprovalLevel', header: 'Approval Level', width: 'w-32',
      render: (v) => v
        ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">{APPROVAL_LEVEL_LABELS[v as keyof typeof APPROVAL_LEVEL_LABELS]}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: 'voucherNo', header: 'Voucher', width: 'w-36',
      render: (v) => v
        ? <span className="font-mono text-xs text-teal-700 font-semibold">{String(v)}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: 'initiatedAt', header: 'Initiated', sortable: true,
      render: (v) => <span className="text-xs text-muted-foreground">{formatDateTime(String(v))}</span>,
    },
  ];

  // Approval chain steps for detail drawer
  function getApprovalSteps(txn: TreasuryTxn) {
    return txn.approvals.map((a) => ({
      id: `step-${a.id}`,
      label: APPROVAL_LEVEL_LABELS[a.level],
      description: a.action
        ? `${a.action} by ${a.approver} — ${formatDateTime(a.actionAt)}`
        : a.status === 'SKIPPED' ? 'Skipped' : 'Awaiting',
      status: (
        a.status === 'APPROVED' ? 'completed' :
        a.status === 'REJECTED' ? 'error' :
        a.status === 'PENDING'&& txn.currentApprovalLevel === a.level ? 'current' : 'pending' ) as'completed' | 'current' | 'pending' | 'error',
    }));
  }

  return (
    <AppLayout>
      {successToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-xl text-sm font-medium animate-fade-in">
          <CheckCircle2 size={16} />
          {successToast}
        </div>
      )}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">All treasury transactions — {total} record{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`btn-secondary text-xs gap-1.5 ${hasActiveFilters ? 'border-accent text-accent' : ''}`}
        >
          <Filter size={12} />
          Filters
          {hasActiveFilters && <span className="w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center">!</span>}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="card p-4 mb-4 slide-up">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-5 gap-3">
            <div>
              <label className="label-text">Search</label>
              <input
                type="text"
                placeholder="Ref, customer, CIF…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="input-field text-xs"
              />
            </div>
            <div>
              <label className="label-text">Status</label>
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="input-field text-xs">
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((s) => <option key={`filter-s-${s}`} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">Type</label>
              <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }} className="input-field text-xs">
                <option value="">All Types</option>
                {TYPE_OPTIONS.map((t) => <option key={`filter-t-${t}`} value={t}>{t} — {TXN_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">Date From</label>
              <input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }} className="input-field text-xs" />
            </div>
            <div>
              <label className="label-text">Date To</label>
              <input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }} className="input-field text-xs" />
            </div>
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-3 text-xs text-red-600 flex items-center gap-1 hover:underline">
              <X size={11} /> Clear all filters
            </button>
          )}
        </div>
      )}

      <div className="card overflow-hidden" style={{ height: 'calc(100vh - 240px)' }}>
        <DataTable
          columns={COLUMNS as ColumnDef<Record<string, unknown>>[]}
          data={data as unknown as Record<string, unknown>[]}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSort={handleSort}
          sortField={sortField}
          sortDir={sortDir}
          loading={loading}
          error={error}
          onRetry={fetchData}
          onRowClick={(row) => setSelectedTxn(row as unknown as TreasuryTxn)}
          exportFilename="treasury-transactions"
          emptyTitle="No transactions found"
          emptyDescription="Adjust your filters or initiate a new treasury transaction."
          stickyHeader
        />
      </div>

      {/* Detail Drawer */}
      <Drawer
        open={!!selectedTxn}
        onClose={() => setSelectedTxn(null)}
        title={selectedTxn?.ref ?? ''}
        subtitle={selectedTxn?.customerName}
        width="w-[600px]"
      >
        {selectedTxn && (
          <div className="space-y-5">
            {/* Status & Type */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={selectedTxn.status} />
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{selectedTxn.type} — {TXN_TYPE_LABELS[selectedTxn.type]}</span>
              {selectedTxn.voucherNo && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold font-mono">{selectedTxn.voucherNo}</span>
              )}
            </div>

            {/* Financial Summary */}
            <div className="card p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Financial Summary</p>
              {[
                ['Principal', formatNaira(selectedTxn.principalAmt)],
                ['Annual Rate', `${selectedTxn.intRate}%`],
                ['Tenor', `${selectedTxn.tenorDays} days`],
                ['Effective Date', formatDate(selectedTxn.effectiveDate)],
                ['Maturity Date', formatDate(selectedTxn.maturityDate)],
                ['Gross Interest', formatNaira(selectedTxn.interestAmt)],
                ['WHT (10%)', `(${formatNaira(selectedTxn.withholdingTax)})`],
                ['Net Interest', formatNaira(selectedTxn.netInterest)],
                ['Total Payout', formatNaira(selectedTxn.totalPayout)],
              ].map(([k, v]) => (
                <div key={`detail-${k}`} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <span className={`font-semibold tabular-nums ${k === 'WHT (10%)' ? 'text-red-600' : k === 'Total Payout' ? 'text-accent text-sm' : 'text-foreground'}`}>{v}</span>
                </div>
              ))}
            </div>

            {/* SOP Checks */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">SOP Verification Checks</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Mandate', done: selectedTxn.mandateVerified },
                  { label: 'Callback', done: selectedTxn.callbackDone },
                  { label: 'CBS Verified', done: selectedTxn.cbsVerified },
                ].map(({ label, done }) => (
                  <div key={`sop-check-${label}`} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${done ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    {done ? <CheckCircle2 size={13} className="text-green-600" /> : <Clock size={13} className="text-amber-600" />}
                    <span className={`text-xs font-semibold ${done ? 'text-green-700' : 'text-amber-700'}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CBS Ref */}
            {selectedTxn.cbsRef && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-teal-50 border border-teal-200 rounded-xl">
                <span className="text-xs text-teal-700 font-semibold">Eazybankz CBS Ref</span>
                <span className="font-mono text-xs font-bold text-teal-800">{selectedTxn.cbsRef}</span>
              </div>
            )}

            {/* Execution Info */}
            {selectedTxn.executionRef && (
              <div className="card p-4 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Execution Details</p>
                {[
                  ['Execution Ref', selectedTxn.executionRef],
                  ['Executed By', selectedTxn.executedBy ?? '—'],
                  ['Executed At', formatDateTime(selectedTxn.executedAt)],
                  ['Notes', selectedTxn.executionNotes ?? '—'],
                ].map(([k, v]) => (
                  <div key={`exec-${k}`} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-semibold text-foreground">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Approval Chain */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Approval Chain</p>
              <Stepper steps={getApprovalSteps(selectedTxn)} orientation="vertical" />
            </div>

            {/* Metadata */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Initiated by <span className="font-semibold text-foreground">{selectedTxn.initiatedBy}</span> on {formatDateTime(selectedTxn.initiatedAt)}</p>
              <p>Last updated: {formatDateTime(selectedTxn.updatedAt)}</p>
            </div>
          </div>
        )}
      </Drawer>
    </AppLayout>
  );
}