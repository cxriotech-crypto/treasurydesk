'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, X, Download, TrendingUp } from 'lucide-react';
import DataTable, { ColumnDef } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { investmentService } from '@/services/investmentService';
import { accruedInterest, daysBetween } from '@/lib/calc';
import { formatNaira, formatDate, formatRate, todayLagos } from '@/lib/format';
import type { Investment, InvestmentProduct, InvestmentStatus } from '@/types';
import Decimal from 'decimal.js';

const PRODUCT_LABELS: Record<InvestmentProduct, string> = {
  TERM: 'Term Deposit',
  CP: 'Commercial Paper',
  CALL: 'Call Placement',
};

const STATUS_COLORS: Record<InvestmentStatus, string> = {
  ACTIVE: 'success',
  MATURED: 'warning',
  AWAITING_INSTRUCTION: 'warning',
  ROLLED: 'info',
  TERMINATED: 'error',
};

interface InvestmentRow extends Record<string, unknown> {
  id: string;
  cbsRef: string;
  customerName: string;
  customerCif: string;
  product: InvestmentProduct;
  principalAmt: string;
  intRate: string;
  effectiveDate: string;
  tenorDays: number;
  maturityDate: string;
  daysToMaturity: number;
  accruedToday: string;
  outstandingBalance: string;
  availableAmt: string;
  status: InvestmentStatus;
  customerId: string;
}

function buildRow(inv: Investment, today: string): InvestmentRow {
  const accrued = accruedInterest(inv, today);
  const dtm = daysBetween(today, inv.maturityDate);
  const outstanding = new Decimal(inv.principalAmt).plus(new Decimal(accrued)).toFixed(2);
  const available = inv.status === 'ACTIVE' ? inv.principalAmt : '0.00';
  return {
    id: inv.id,
    cbsRef: inv.cbsRef,
    customerName: inv.customerName,
    customerCif: inv.customerCif,
    product: inv.product,
    principalAmt: inv.principalAmt,
    intRate: inv.intRate,
    effectiveDate: inv.effectiveDate,
    tenorDays: inv.tenorDays,
    maturityDate: inv.maturityDate,
    daysToMaturity: dtm,
    accruedToday: accrued,
    outstandingBalance: outstanding,
    availableAmt: available,
    status: inv.status,
    customerId: inv.customerId,
  };
}

export default function InvestmentsClient() {
  const router = useRouter();
  const today = todayLagos();

  const [rows, setRows] = useState<InvestmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('maturityDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMatFrom, setFilterMatFrom] = useState('');
  const [filterMatTo, setFilterMatTo] = useState('');
  const [filterPrinMin, setFilterPrinMin] = useState('');
  const [filterPrinMax, setFilterPrinMax] = useState('');

  // Summary (computed from ALL filtered items, not just current page)
  const [summaryCount, setSummaryCount] = useState(0);
  const [summaryPrincipal, setSummaryPrincipal] = useState('0.00');
  const [summaryAccrued, setSummaryAccrued] = useState('0.00');

  const buildFilters = useCallback(() => {
    const f: Record<string, string> = {};
    if (filterProduct) f.product = filterProduct;
    if (filterStatus) f.status = filterStatus;
    if (filterCustomer) f.customerName = filterCustomer;
    if (filterMatFrom) f.maturityFrom = filterMatFrom;
    if (filterMatTo) f.maturityTo = filterMatTo;
    if (filterPrinMin) f.principalMin = filterPrinMin;
    if (filterPrinMax) f.principalMax = filterPrinMax;
    return f;
  }, [filterProduct, filterStatus, filterCustomer, filterMatFrom, filterMatTo, filterPrinMin, filterPrinMax]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = buildFilters();
      // Fetch all for summary
      const all = await investmentService.list({ page: 1, pageSize: 9999, filters });
      const allRows = all.items.map((inv) => buildRow(inv, today));
      const totalPrin = allRows.reduce((s, r) => s.plus(r.principalAmt), new Decimal(0));
      const totalAcc = allRows.reduce((s, r) => s.plus(r.accruedToday), new Decimal(0));
      setSummaryCount(all.total);
      setSummaryPrincipal(totalPrin.toFixed(2));
      setSummaryAccrued(totalAcc.toFixed(2));

      // Fetch page
      const res = await investmentService.list({
        page,
        pageSize,
        sort: { field: sortField, dir: sortDir },
        filters,
      });
      setRows(res.items.map((inv) => buildRow(inv, today)));
      setTotal(res.total);
    } catch (e) {
      setError('Failed to load investments. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortField, sortDir, buildFilters, today]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function clearFilters() {
    setFilterProduct('');
    setFilterStatus('');
    setFilterCustomer('');
    setFilterMatFrom('');
    setFilterMatTo('');
    setFilterPrinMin('');
    setFilterPrinMax('');
    setPage(1);
  }

  const hasFilters = !!(filterProduct || filterStatus || filterCustomer || filterMatFrom || filterMatTo || filterPrinMin || filterPrinMax);

  function handleExportCSV() {
    const headers = ['CBS Ref', 'Customer', 'CIF', 'Product', 'Principal', 'Rate', 'Effective Date', 'Tenor', 'Maturity Date', 'Days to Maturity', 'Accrued Interest', 'Outstanding Balance', 'Available Amount', 'Status'];
    const csvRows = rows.map((r) => [
      r.cbsRef, r.customerName, r.customerCif, PRODUCT_LABELS[r.product],
      r.principalAmt, r.intRate, r.effectiveDate, String(r.tenorDays),
      r.maturityDate, String(r.daysToMaturity), r.accruedToday,
      r.outstandingBalance, r.availableAmt, r.status,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investments-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<InvestmentRow>[] = [
    { key: 'cbsRef', header: 'CBS Ref', sortable: true, width: 'w-36' },
    { key: 'customerName', header: 'Customer', sortable: true, render: (_, r) => (
      <div>
        <div className="font-medium text-foreground text-xs">{r.customerName}</div>
        <div className="text-[10px] text-muted-foreground">{r.customerCif}</div>
      </div>
    )},
    { key: 'product', header: 'Product', sortable: true, render: (v) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide
        ${v === 'TERM' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
          v === 'CP'? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'}`}>
        {String(v)}
      </span>
    )},
    { key: 'principalAmt', header: 'Principal', sortable: true, align: 'right', render: (v) => <span className="tabular-nums">{formatNaira(String(v))}</span> },
    { key: 'intRate', header: 'Rate', sortable: true, align: 'right', render: (v) => <span className="tabular-nums">{formatRate(String(v))}</span> },
    { key: 'effectiveDate', header: 'Effective', sortable: true, render: (v) => formatDate(String(v)) },
    { key: 'tenorDays', header: 'Tenor', sortable: true, align: 'right', render: (v) => `${v}d` },
    { key: 'maturityDate', header: 'Maturity', sortable: true, render: (v) => formatDate(String(v)) },
    { key: 'daysToMaturity', header: 'DTM', sortable: true, align: 'right', render: (v) => {
      const n = Number(v);
      const cls = n < 0 ? 'text-red-600 font-semibold' : n <= 7 ? 'text-amber-600 font-semibold' : 'text-foreground';
      return <span className={`tabular-nums ${cls}`}>{n < 0 ? `${Math.abs(n)}d overdue` : `${n}d`}</span>;
    }},
    { key: 'accruedToday', header: 'Accrued Interest', sortable: false, align: 'right', render: (v) => <span className="tabular-nums text-teal-600 dark:text-teal-400">{formatNaira(String(v))}</span> },
    { key: 'outstandingBalance', header: 'Outstanding', sortable: false, align: 'right', render: (v) => <span className="tabular-nums font-medium">{formatNaira(String(v))}</span> },
    { key: 'availableAmt', header: 'Available', sortable: false, align: 'right', render: (v) => <span className="tabular-nums">{formatNaira(String(v))}</span> },
    { key: 'status', header: 'Status', sortable: true, render: (v) => <StatusBadge status={String(v)} /> },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <TrendingUp size={16} className="text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-none">Investments</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Live portfolio view — accrued interest updates to today</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`btn-secondary text-xs flex items-center gap-1.5 ${hasFilters ? 'border-accent text-accent' : ''}`}
          >
            <Filter size={13} />
            Filters
            {hasFilters && <span className="w-4 h-4 rounded-full bg-accent text-white text-[9px] flex items-center justify-center font-bold">!</span>}
          </button>
          <button onClick={handleExportCSV} className="btn-secondary text-xs flex items-center gap-1.5">
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="card p-4 border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Filters</span>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X size={11} /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Product</label>
              <select value={filterProduct} onChange={(e) => { setFilterProduct(e.target.value); setPage(1); }} className="input-field text-xs py-1.5">
                <option value="">All Products</option>
                <option value="TERM">Term Deposit</option>
                <option value="CP">Commercial Paper</option>
                <option value="CALL">Call Placement</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Status</label>
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="input-field text-xs py-1.5">
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="MATURED">Matured</option>
                <option value="AWAITING_INSTRUCTION">Awaiting Instruction</option>
                <option value="ROLLED">Rolled</option>
                <option value="TERMINATED">Terminated</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Customer</label>
              <input value={filterCustomer} onChange={(e) => { setFilterCustomer(e.target.value); setPage(1); }} placeholder="Name or CIF…" className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Maturity From</label>
              <input type="date" value={filterMatFrom} onChange={(e) => { setFilterMatFrom(e.target.value); setPage(1); }} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Maturity To</label>
              <input type="date" value={filterMatTo} onChange={(e) => { setFilterMatTo(e.target.value); setPage(1); }} className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Min Principal (₦)</label>
              <input type="number" value={filterPrinMin} onChange={(e) => { setFilterPrinMin(e.target.value); setPage(1); }} placeholder="0" className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Max Principal (₦)</label>
              <input type="number" value={filterPrinMax} onChange={(e) => { setFilterPrinMax(e.target.value); setPage(1); }} placeholder="∞" className="input-field text-xs py-1.5" />
            </div>
          </div>
        </div>
      )}

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 rounded-xl border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Investments (filtered)</p>
          <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">{summaryCount.toLocaleString()}</p>
        </div>
        <div className="card p-3 rounded-xl border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Total Principal</p>
          <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">{formatNaira(summaryPrincipal)}</p>
        </div>
        <div className="card p-3 rounded-xl border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Total Accrued Interest</p>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400 tabular-nums mt-0.5">{formatNaira(summaryAccrued)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card rounded-xl border border-border flex-1 overflow-hidden" style={{ minHeight: 400 }}>
        <DataTable
          columns={columns}
          data={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          onSort={(field, dir) => { setSortField(field); setSortDir(dir); setPage(1); }}
          sortField={sortField}
          sortDir={sortDir}
          loading={loading}
          error={error}
          onRetry={fetchData}
          onRowClick={(row) => router.push(`/investments/${row.id}`)}
          exportFilename="investments"
          emptyTitle="No investments found"
          emptyDescription="Try adjusting your filters or check back later."
          rowClassName={(row) => {
            if (row.status === 'AWAITING_INSTRUCTION') return 'bg-amber-50/50 dark:bg-amber-900/10';
            if (Number(row.daysToMaturity) <= 7 && Number(row.daysToMaturity) >= 0) return 'bg-orange-50/30 dark:bg-orange-900/10';
            return '';
          }}
        />
      </div>
    </div>
  );
}
