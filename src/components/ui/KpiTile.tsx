'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCount, formatNaira, formatNairaCompact } from '@/lib/format';
import { cn } from './cn';
import { Skeleton } from './States';

export interface KpiTileProps {
  label: string;
  /** Count or money string (computed by services). */
  value: number | string | null | undefined;
  kind?: 'count' | 'money' | 'text';
  /** Secondary line, e.g. "₦1.2B total" or "oldest 3h 10m". */
  sub?: ReactNode;
  /** Clicking the tile opens this (filtered list). Only pass routes that exist. */
  href?: string;
  tone?: 'default' | 'warning' | 'danger';
  loading?: boolean;
}

/** Compact KPI tile. Money shows compact (₦10.53M) with the exact value on hover. */
export function KpiTile({
  label,
  value,
  kind = 'count',
  sub,
  href,
  tone = 'default',
  loading,
}: KpiTileProps) {
  const text =
    value === null || value === undefined
      ? '—'
      : kind === 'money'
        ? formatNairaCompact(String(value))
        : kind === 'count'
          ? formatCount(Number(value))
          : String(value);
  const exact =
    kind === 'money' && value !== null && value !== undefined
      ? formatNaira(String(value))
      : undefined;
  const inner = (
    <>
      <p className="text-[13px] font-medium leading-snug text-muted">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p
          title={exact}
          className={cn(
            'num mt-1 text-2xl font-semibold tracking-tight',
            tone === 'warning' && 'text-st-warning-fg',
            tone === 'danger' && 'text-st-danger-fg'
          )}
        >
          {text}
        </p>
      )}
      {sub && !loading ? <p className="mt-0.5 truncate text-xs text-muted">{sub}</p> : null}
    </>
  );
  const cls = 'block min-w-0 rounded-lg border border-border bg-surface px-4 py-3';
  return href ? (
    <Link
      href={href}
      className={cn(
        cls,
        'transition-colors hover:border-border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Responsive grid for KPI tiles: 2 per row on phones. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}
