import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-muted rounded-md ${className}`} />;
}

export function TableSkeleton({ rows = 8, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={`skel-row-${ri}`} className="flex gap-4 px-4 py-3 border-b border-border">
          {Array.from({ length: cols }).map((_, ci) => (
            <Skeleton key={`skel-cell-${ri}-${ci}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return <Skeleton className={`w-full rounded-lg`} style={{ height }} />;
}