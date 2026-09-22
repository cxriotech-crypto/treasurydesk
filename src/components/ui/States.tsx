'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';
import { Icon } from './Icon';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded bg-surface-2', className)} />;
}

/** Skeleton rows for lists and panels. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('space-y-2', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Empty state: text and an action — no illustration. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-4 py-10 text-center', className)}
    >
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: Error | string;
  onRetry?: () => void;
  className?: string;
}) {
  const message = typeof error === 'string' ? error : error.message;
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center px-4 py-10 text-center', className)}
    >
      <Icon icon={AlertTriangle} size={20} className="text-st-danger-fg" />
      <p className="mt-2 text-sm font-semibold">Something went wrong</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{message}</p>
      {onRetry ? (
        <Button className="mt-4" size="sm" icon={RotateCw} onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** Loading / error / empty / content switch for a useData() result. */
export function DataView<T>({
  state,
  children,
  isEmpty,
  empty,
  skeleton,
}: {
  state: { data: T | undefined; error: Error | null; loading: boolean; reload: () => void };
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
}) {
  if (state.error && state.data === undefined)
    return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.loading || state.data === undefined)
    return <>{skeleton ?? <SkeletonRows className="p-4" />}</>;
  if (isEmpty?.(state.data)) return <>{empty ?? <EmptyState title="Nothing to show" />}</>;
  return <>{children(state.data)}</>;
}

export function InlineAlert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const cls = {
    info: 'border-st-info-fg/30 bg-st-info-bg text-st-info-fg',
    warning: 'border-st-warning-fg/30 bg-st-warning-bg text-st-warning-fg',
    danger: 'border-st-danger-fg/30 bg-st-danger-bg text-st-danger-fg',
    success: 'border-st-success-fg/30 bg-st-success-bg text-st-success-fg',
  }[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-2 rounded-md border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between',
        cls
      )}
    >
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title ? 'mt-0.5' : '', 'text-[13px]')}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
