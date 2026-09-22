'use client';
import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { TableSkeleton } from './LoadingSkeleton';
import EmptyState from './EmptyState';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render?: (value: unknown, row: T) => React.ReactNode;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSort?: (field: string, dir: 'asc' | 'desc') => void;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  exportFilename?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  rowClassName?: (row: T) => string;
  stickyHeader?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function DataTable<T extends Record<string, unknown>>({
  columns, data, total, page, pageSize, onPageChange, onPageSizeChange,
  onSort, sortField, sortDir, loading, error, onRetry, onRowClick,
  exportFilename = 'export', emptyTitle = 'No records found',
  emptyDescription, rowClassName, stickyHeader = true,
}: DataTableProps<T>) {
  const [localSort, setLocalSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);

  const totalPages = Math.ceil(total / pageSize);
  const activeSort = sortField ? { field: sortField, dir: sortDir ?? 'asc' } : localSort;

  function handleSort(field: string) {
    if (!onSort) return;
    const newDir = activeSort?.field === field && activeSort.dir === 'asc' ? 'desc' : 'asc';
    setLocalSort({ field, dir: newDir });
    onSort(field, newDir);
  }

  function handleExport() {
    const headers = columns.map((c) => c.header).join(',');
    const rows = data.map((row) =>
      columns.map((c) => {
        const val = row[c.key];
        const str = String(val ?? '').replace(/,/g, ';');
        return `"${str}"`;
      }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortIcon({ field }: { field: string }) {
    if (!activeSort || activeSort.field !== field) return <ChevronsUpDown size={12} className="text-muted-foreground/50" />;
    return activeSort.dir === 'asc' ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  const pageNums: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNums.push(i);
  } else {
    pageNums.push(1);
    if (page > 3) pageNums.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pageNums.push(i);
    if (page < totalPages - 2) pageNums.push('...');
    pageNums.push(totalPages);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div className={`flex-1 overflow-auto scrollbar-thin ${stickyHeader ? 'relative' : ''}`}>
        <table className="w-full text-sm border-collapse min-w-max">
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr className="bg-secondary border-b border-border">
              {columns.map((col) => (
                <th
                  key={`th-${col.key}`}
                  className={`px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap
                    ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                    ${col.width ?? ''}
                    ${col.sortable && onSort ? 'cursor-pointer select-none hover:text-foreground' : ''}`}
                  onClick={col.sortable && onSort ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && onSort && <SortIcon field={col.key} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <TableSkeleton rows={pageSize > 10 ? 10 : pageSize} cols={columns.length} />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="flex flex-col items-center py-12 gap-3">
                    <p className="text-sm text-red-600 font-medium">{error}</p>
                    {onRetry && (
                      <button onClick={onRetry} className="btn-secondary text-xs">
                        Retry
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              data.map((row, ri) => (
                <tr
                  key={`row-${row.id ?? ri}`}
                  className={`border-b border-border transition-colors
                    ${ri % 2 === 0 ? 'bg-card' : 'bg-background/50'}
                    ${onRowClick ? 'cursor-pointer hover:bg-accent/5' : 'hover:bg-muted/30'}
                    ${rowClassName ? rowClassName(row) : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={`cell-${row.id ?? ri}-${col.key}`}
                      className={`px-3 py-2.5 text-sm text-foreground whitespace-nowrap
                        ${col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : ''}`}
                    >
                      {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {total === 0 ? 'No records' : `${((page - 1) * pageSize) + 1}–${Math.min(page * pageSize, total)} of ${total}`}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
              className="input-field py-1 text-xs w-16"
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={`ps-${s}`} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          {pageNums.map((n, i) =>
            n === '...' ? (
              <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
            ) : (
              <button
                key={`page-${n}`}
                onClick={() => onPageChange(n as number)}
                className={`w-7 h-7 text-xs rounded-md transition-colors font-medium
                  ${page === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {n}
              </button>
            )
          )}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={handleExport}
            className="ml-2 p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
            title="Export CSV"
            aria-label="Export to CSV"
          >
            <Download size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}