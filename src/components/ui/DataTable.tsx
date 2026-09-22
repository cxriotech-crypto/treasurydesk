'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
} from 'lucide-react';
import type { SortDir } from '@/domain/types';
import { formatCount } from '@/lib/format';
import { Button, IconButton } from './Button';
import { cn } from './cn';
import { Icon } from './Icon';
import { EmptyState, ErrorState, Skeleton } from './States';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Field name passed to the service sort (omit for unsortable columns). */
  sortKey?: string;
  align?: 'left' | 'right';
  className?: string;
  /** Role of this column in the stacked card shown below 768 px. */
  card?: 'title' | 'status' | 'amount' | 'field' | 'hidden';
  /** Short label used in the card (defaults to header). */
  cardLabel?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  /** Row navigation: a link (preferred) or a click handler. */
  rowHref?: (row: T) => string | null;
  onRowClick?: (row: T) => void;
  sort?: { field: string; dir: SortDir };
  onSortChange?: (sort: { field: string; dir: SortDir }) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  /** Toolbar above the table (search, filters…). */
  toolbar?: ReactNode;
  onExport?: () => void;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  isSelectable?: (row: T) => boolean;
  footer?: ReactNode;
  caption?: string;
}

/**
 * Data table: sortable headers, pagination, CSV export, row links, sticky header, optional selection.
 * Below 768 px rows render as stacked cards (title + status + amount, then key fields).
 * Wide tables scroll inside their own container, never the page.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  rowHref,
  onRowClick,
  sort,
  onSortChange,
  page = 1,
  pageSize,
  total,
  onPageChange,
  empty = { title: 'Nothing to show' },
  toolbar,
  onExport,
  selectable,
  selected,
  onSelectedChange,
  isSelectable = () => true,
  footer,
  caption,
}: DataTableProps<T>) {
  const router = useRouter();
  const count = total ?? rows?.length ?? 0;
  const pages = pageSize ? Math.max(1, Math.ceil(count / pageSize)) : 1;
  const from = count === 0 ? 0 : (page - 1) * (pageSize ?? count) + 1;
  const to = pageSize ? Math.min(count, page * pageSize) : count;
  const selectableRows = (rows ?? []).filter(isSelectable);
  const allSelected =
    !!selectableRows.length && selectableRows.every((r) => selected?.has(rowKey(r)));

  const toggleSort = (field: string) => {
    if (!onSortChange) return;
    onSortChange(
      sort?.field === field
        ? { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' }
    );
  };
  const toggleRow = (id: string) => {
    if (!onSelectedChange || !selected) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };
  const toggleAll = () => {
    if (!onSelectedChange) return;
    onSelectedChange(allSelected ? new Set() : new Set(selectableRows.map(rowKey)));
  };

  const cardCols = {
    title: columns.find((c) => c.card === 'title') ?? columns[0],
    status: columns.find((c) => c.card === 'status'),
    amount: columns.find((c) => c.card === 'amount'),
    fields: columns.filter((c) => (c.card ?? 'field') === 'field' && c !== columns[0]),
  };

  const rowLink = (r: T) => rowHref?.(r) ?? null;

  let body: ReactNode;
  if (error && !rows) {
    body = <ErrorState error={error} onRetry={onRetry} />;
  } else if (loading && !rows) {
    body = (
      <div role="status" aria-label="Loading" className="space-y-3 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  } else if (!rows || rows.length === 0) {
    body = <EmptyState title={empty.title} description={empty.description} action={empty.action} />;
  } else {
    body = (
      <>
        {/* Cards below 768 px */}
        <ul className="divide-y divide-border md:hidden">
          {rows.map((r) => {
            const id = rowKey(r);
            const href = rowLink(r);
            const inner = (
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 font-medium">{cardCols.title.cell(r)}</div>
                  {cardCols.amount ? (
                    <div className="num shrink-0 text-right font-medium">
                      {cardCols.amount.cell(r)}
                    </div>
                  ) : null}
                </div>
                {cardCols.status ? <div className="mt-1">{cardCols.status.cell(r)}</div> : null}
                {cardCols.fields.length ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                    {cardCols.fields.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-[11px] text-muted">{c.cardLabel ?? c.header}</dt>
                        <dd className="truncate text-[13px]">{c.cell(r)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            );
            return (
              <li key={id} className="flex items-start gap-3 px-4 py-3">
                {selectable ? (
                  <input
                    type="checkbox"
                    aria-label="Select row"
                    className="form-checkbox mt-1 h-5 w-5 rounded border-border-strong text-brand"
                    disabled={!isSelectable(r)}
                    checked={selected?.has(id) ?? false}
                    onChange={() => toggleRow(id)}
                  />
                ) : null}
                {href ? (
                  <Link href={href} className="block min-w-0 flex-1">
                    {inner}
                  </Link>
                ) : onRowClick ? (
                  <button
                    type="button"
                    className="block min-w-0 flex-1 text-left"
                    onClick={() => onRowClick(r)}
                  >
                    {inner}
                  </button>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>

        {/* Table from 768 px; scrolls inside its own container when wide */}
        <div className="hidden max-h-[70vh] overflow-auto scrollbar-thin md:block">
          <table className="w-full border-separate border-spacing-0 text-sm">
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <thead>
              <tr>
                {selectable ? (
                  <th className="sticky top-0 z-10 w-10 border-b border-border bg-surface-2 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="form-checkbox h-4 w-4 rounded border-border-strong text-brand"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                ) : null}
                {columns.map((c) => {
                  const active = !!sort && !!c.sortKey && sort.field === c.sortKey;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={
                        active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                      className={cn(
                        'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-muted',
                        c.align === 'right' ? 'text-right' : 'text-left',
                        c.className
                      )}
                    >
                      {c.sortKey && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.sortKey!)}
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-fg',
                            c.align === 'right' && 'flex-row-reverse'
                          )}
                        >
                          {c.header}
                          <Icon
                            icon={
                              active ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown
                            }
                            size={13}
                            className={active ? 'text-fg' : 'opacity-60'}
                          />
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = rowKey(r);
                const href = rowLink(r);
                const clickable = !!href || !!onRowClick;
                return (
                  <tr
                    key={id}
                    className={cn('group', clickable && 'cursor-pointer hover:bg-surface-2')}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a,button,input,label')) return;
                      if (href) router.push(href);
                      else onRowClick?.(r);
                    }}
                  >
                    {selectable ? (
                      <td className="border-b border-border px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          className="form-checkbox h-4 w-4 rounded border-border-strong text-brand"
                          disabled={!isSelectable(r)}
                          checked={selected?.has(id) ?? false}
                          onChange={() => toggleRow(id)}
                        />
                      </td>
                    ) : null}
                    {columns.map((c, ci) => (
                      <td
                        key={c.key}
                        className={cn(
                          'border-b border-border px-3 py-2.5 align-middle',
                          c.align === 'right' && 'num whitespace-nowrap text-right',
                          c.className
                        )}
                      >
                        {ci === 0 && href ? (
                          <Link href={href} className="font-medium hover:underline">
                            {c.cell(r)}
                          </Link>
                        ) : (
                          c.cell(r)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {footer ? <tfoot>{footer}</tfoot> : null}
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface">
      {toolbar || onExport ? (
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {onExport ? (
            <Button size="sm" icon={Download} onClick={onExport} disabled={!rows?.length}>
              Export CSV
            </Button>
          ) : null}
        </div>
      ) : null}
      {body}
      {rows && rows.length > 0 && onPageChange && pageSize ? (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[13px] text-muted">
          <span className="num">
            {formatCount(from)}–{formatCount(to)} of {formatCount(count)}
          </span>
          <div className="flex items-center gap-1">
            <IconButton
              icon={ChevronLeft}
              label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            />
            <span className="num px-1">
              {page} / {pages}
            </span>
            <IconButton
              icon={ChevronRight}
              label="Next page"
              disabled={page >= pages}
              onClick={() => onPageChange(page + 1)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
