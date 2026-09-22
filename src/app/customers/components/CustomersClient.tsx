'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Filter, X, Plus } from 'lucide-react';
import DataTable, { ColumnDef } from '@/components/ui/DataTable';
import { customerService } from '@/services/customerService';
import { investmentService } from '@/services/investmentService';
import { formatNaira } from '@/lib/format';
import type { Customer } from '@/types';
import Decimal from 'decimal.js';
import { getSession } from '@/services/userService';

interface CustomerRow extends Record<string, unknown> {
  id: string;
  cif: string;
  name: string;
  customerType: string;
  accountOfficerName: string;
  phone: string;
  investmentCount: number;
  totalInvested: string;
  isWhtExempt: boolean;
}

export default function CustomersClient() {
  const router = useRouter();
  const session = getSession();
  const canEdit = session?.user?.role === 'SYSTEM_ADMIN' || session?.user?.role === 'TREASURY_OFFICER';

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [filterSearch, setFilterSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterWht, setFilterWht] = useState('');

  const buildFilters = useCallback(() => {
    const f: Record<string, string> = {};
    if (filterSearch) f.search = filterSearch;
    if (filterType) f.customerType = filterType;
    if (filterWht) f.isWhtExempt = filterWht;
    return f;
  }, [filterSearch, filterType, filterWht]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = buildFilters();
      const res = await customerService.list({
        page, pageSize,
        sort: { field: sortField, dir: sortDir },
        filters,
      });

      // Compute investment counts and totals
      const enriched: CustomerRow[] = await Promise.all(
        res.items.map(async (c) => {
          const invs = await investmentService.getByCustomerId(c.id);
          const totalInvested = invs
            .filter((i) => i.status === 'ACTIVE' || i.status === 'AWAITING_INSTRUCTION')
            .reduce((s, i) => s.plus(new Decimal(i.principalAmt)), new Decimal(0))
            .toFixed(2);
          return {
            id: c.id,
            cif: c.cif,
            name: c.name,
            customerType: c.customerType,
            accountOfficerName: c.accountOfficerName,
            phone: c.phone,
            investmentCount: invs.filter((i) => i.status === 'ACTIVE' || i.status === 'AWAITING_INSTRUCTION').length,
            totalInvested,
            isWhtExempt: c.isWhtExempt,
          };
        })
      );

      setRows(enriched);
      setTotal(res.total);
    } catch {
      setError('Failed to load customers. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortField, sortDir, buildFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function clearFilters() {
    setFilterSearch('');
    setFilterType('');
    setFilterWht('');
    setPage(1);
  }

  const hasFilters = !!(filterSearch || filterType || filterWht);

  const columns: ColumnDef<CustomerRow>[] = [
    { key: 'cif', header: 'CIF', sortable: true, width: 'w-28', render: (v) => <span className="font-mono text-xs text-accent">{String(v)}</span> },
    { key: 'name', header: 'Name', sortable: true, render: (v, r) => (
      <div>
        <div className="font-medium text-foreground text-xs">{String(v)}</div>
        <div className="text-[10px] text-muted-foreground">{r.customerType === 'CORPORATE' ? 'Corporate' : 'Individual'}</div>
      </div>
    )},
    { key: 'customerType', header: 'Type', sortable: true, render: (v) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide
        ${v === 'CORPORATE' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
        {v === 'CORPORATE' ? 'Corp' : 'Indiv'}
      </span>
    )},
    { key: 'accountOfficerName', header: 'Account Officer', sortable: true },
    { key: 'phone', header: 'Phone', render: (v) => <span className="font-mono text-xs">{String(v)}</span> },
    { key: 'investmentCount', header: 'Investments', sortable: true, align: 'right', render: (v) => (
      <span className={`tabular-nums font-semibold ${Number(v) > 0 ? 'text-accent' : 'text-muted-foreground'}`}>{String(v)}</span>
    )},
    { key: 'totalInvested', header: 'Total Invested', sortable: true, align: 'right', render: (v) => (
      <span className="tabular-nums font-medium">{formatNaira(String(v))}</span>
    )},
    { key: 'isWhtExempt', header: 'WHT Exempt', align: 'center', render: (v) => (
      v ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Exempt</span>
        : <span className="text-muted-foreground text-[10px]">—</span>
    )},
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Users size={16} className="text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-none">Customers</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Customer registry with investment totals</p>
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
          {canEdit && (
            <button onClick={() => router.push('/customers/new')} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus size={13} />
              Add Customer
            </button>
          )}
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Search</label>
              <input value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); setPage(1); }} placeholder="Name, CIF, phone…" className="input-field text-xs py-1.5" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Type</label>
              <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }} className="input-field text-xs py-1.5">
                <option value="">All Types</option>
                <option value="INDIVIDUAL">Individual</option>
                <option value="CORPORATE">Corporate</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">WHT Status</label>
              <select value={filterWht} onChange={(e) => { setFilterWht(e.target.value); setPage(1); }} className="input-field text-xs py-1.5">
                <option value="">All</option>
                <option value="true">WHT Exempt</option>
                <option value="false">WHT Applicable</option>
              </select>
            </div>
          </div>
        </div>
      )}

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
          onRowClick={(row) => router.push(`/customers/${row.id}`)}
          exportFilename="customers"
          emptyTitle="No customers found"
          emptyDescription="Try adjusting your filters or add a new customer."
        />
      </div>
    </div>
  );
}
