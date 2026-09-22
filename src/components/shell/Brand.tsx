import { cn } from '@/components/ui/cn';

/** Text wordmark (no logo image). */
export function Brand({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-[13px] font-bold tracking-tight text-brand-fg"
      >
        TD
      </span>
      {compact ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-semibold tracking-tight">
            TreasuryDesk
          </span>
          <span className="block truncate text-[11px] text-muted">First Marina Trust Finance</span>
        </span>
      )}
    </div>
  );
}
