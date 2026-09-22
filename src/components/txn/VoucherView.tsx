'use client';

import type { PaymentInstr, VoucherRow } from '@/domain/types';
import { VOUCHER_TYPE_META, type VoucherType } from '@/domain/codes';
import { formatDate, formatNaira, formatRate } from '@/lib/format';
import { FormulaHint, InlineAlert, cn } from '@/components/ui';

export function formatRowValue(row: Pick<VoucherRow, 'value' | 'format'>): string {
  if (row.value === '' || row.value === undefined || row.value === null) return '—';
  switch (row.format) {
    case 'money':
      return formatNaira(row.value);
    case 'date':
      return formatDate(row.value);
    case 'rate':
      return formatRate(row.value);
    case 'days':
      return `${row.value} days`;
    default:
      return row.value;
  }
}

export interface VoucherLike {
  voucherType: VoucherType;
  voucherNo?: string;
  rows: VoucherRow[];
  notes: string[];
  remarks: string;
  payment: PaymentInstr | null;
}

export function PaymentBlock({ p }: { p: PaymentInstr }) {
  return (
    <div className="rounded-md border border-border">
      <p className="border-b border-border bg-surface-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Payment instruction
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 p-3 text-sm sm:grid-cols-2">
        {[
          ['Beneficiary name', p.benefName],
          ['Bank', p.bankName],
          ['Account number', p.accountNo],
          ['Account type', p.accountType === 'CURRENT' ? 'Current' : 'Savings'],
          ['Amount', formatNaira(p.amount)],
          ['Transfer charge', formatNaira(p.transferCharge)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="num break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Voucher rows: inputs plain, calculated figures shaded with the fx formula, totals emphasised. */
export function VoucherView({ v, showTitle = true }: { v: VoucherLike; showTitle?: boolean }) {
  return (
    <div className="space-y-3">
      {showTitle ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[15px] font-semibold">{VOUCHER_TYPE_META[v.voucherType].label}</h3>
          {v.voucherNo ? <span className="num text-[13px] text-muted">{v.voucherNo}</span> : null}
        </div>
      ) : null}
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {v.rows.map((r, i) => {
          const calc = r.kind === 'calc' || r.kind === 'total';
          return (
            <div
              key={`${r.label}-${i}`}
              className={cn(
                'flex items-center justify-between gap-3 px-3 py-2',
                calc && 'bg-surface-2',
                r.kind === 'total' && 'font-semibold'
              )}
            >
              <span
                className={cn('min-w-0 text-[13px]', r.kind === 'total' ? 'text-fg' : 'text-muted')}
              >
                {r.label}
                {r.note ? <span className="block text-xs text-st-warning-fg">{r.note}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'num text-right text-sm',
                    r.format === 'text' && 'max-w-[14rem] truncate sm:max-w-xs'
                  )}
                >
                  {formatRowValue(r)}
                </span>
                {calc && r.formula ? (
                  <FormulaHint formula={r.formula} />
                ) : (
                  <span className="w-[34px]" aria-hidden />
                )}
              </span>
            </div>
          );
        })}
      </div>
      {v.notes.map((n) => (
        <InlineAlert key={n} tone="info">
          {n}
        </InlineAlert>
      ))}
      {v.payment ? <PaymentBlock p={v.payment} /> : null}
      {v.remarks ? (
        <div className="rounded-md border border-border px-3 py-2">
          <p className="text-xs text-muted">Remarks</p>
          <p className="text-sm">{v.remarks}</p>
        </div>
      ) : null}
    </div>
  );
}

/** "Roll ₦7,000,000 | Pay ₦3,000,000" split bar for Rollover C / partial pre-liquidation. */
export function SplitBar({
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
}) {
  const l = Math.max(0, Number(left));
  const r = Math.max(0, Number(right));
  const pct = l + r > 0 ? (l / (l + r)) * 100 : 50; // display proportion only
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="bg-brand" style={{ width: `${pct}%` }} />
        <div className="bg-teal-bright" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[13px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
          {leftLabel} <span className="num font-semibold">{formatNaira(left)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-teal-bright" aria-hidden />
          {rightLabel} <span className="num font-semibold">{formatNaira(right)}</span>
        </span>
      </div>
    </div>
  );
}
