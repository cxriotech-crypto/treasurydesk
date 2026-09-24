'use client';

import { useEffect } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { CHANNEL_LABELS } from '@/domain/codes';
import { formatDate, formatDateTime, formatNaira } from '@/lib/format';
import { vouchersService } from '@/services';
import { useCurrentUser, useData } from '@/services/useData';
import { useMounted } from '@/components/hooks';
import { Button, ErrorState, SkeletonRows } from '@/components/ui';
import { formatRowValue } from '@/components/txn/VoucherView';

/** A4 paper voucher (brief §11.3). Outside the app shell; prints on one page. */
export function PrintVoucher() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useMounted();
  const user = useCurrentUser();
  const draft = id === 'draft';
  const txnId = sp.get('txn') ?? '';
  const seq = Number(sp.get('seq') ?? 1);

  useEffect(() => {
    if (mounted && !user)
      router.replace(`/login?next=${encodeURIComponent(`${pathname}?${sp.toString()}`)}`);
  }, [mounted, user, router, pathname, sp]);

  const q = useData(
    () =>
      user
        ? draft
          ? vouchersService.printableDraft(txnId, seq)
          : vouchersService.printable(id)
        : Promise.resolve(null),
    [id, txnId, seq, user?.id]
  );

  if (!mounted || !user) return null;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <SkeletonRows rows={12} className="mx-auto max-w-3xl p-6" />;
  const p = q.data;
  const v = p.voucher;

  return (
    <div className="min-h-screen bg-surface-2 print:bg-white">
      <style>{`@page { size: A4 portrait; margin: 10mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 print:hidden">
        <Button
          icon={ArrowLeft}
          onClick={() =>
            window.history.length > 1 ? router.back() : router.push(`/transactions/${p.txn.id}`)
          }
        >
          Back
        </Button>
        <p className="hidden text-sm text-muted sm:block">
          {v.voucherNo} · {p.txn.txnRef}
        </p>
        <Button variant="primary" icon={Printer} onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <div className="overflow-x-auto px-2 py-6 print:overflow-visible print:p-0">
        <article
          className="relative mx-auto w-[190mm] min-w-[190mm] overflow-hidden bg-white p-[10mm] text-[11px] leading-snug text-zinc-900 shadow-pop print:w-auto print:min-w-0 print:p-0 print:shadow-none"
          style={{ colorScheme: 'light' }}
        >
          {/* Watermarks */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="-rotate-[30deg] select-none text-center font-bold tracking-widest text-zinc-900/[0.06]">
              <p className="text-[110px] leading-none">DEMO</p>
              {p.isDraft ? <p className="text-[80px] leading-none">DRAFT</p> : null}
            </div>
          </div>

          <header className="flex items-start justify-between gap-4 border-b-2 border-zinc-900 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-zinc-900 text-sm font-bold">
                FMT
              </span>
              <div>
                <p className="text-[13px] font-bold uppercase tracking-wide">{p.companyName}</p>
                <p className="text-[10px] text-zinc-600">Treasury Operations · TreasuryDesk</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[15px] font-bold tracking-wide">{p.title}</p>
              <p className="num text-[11px]">No. {v.voucherNo}</p>
              {p.isDraft ? (
                <p className="text-[10px] font-semibold text-red-700">DRAFT — NOT SUBMITTED</p>
              ) : null}
            </div>
          </header>

          <section className="mt-3 grid grid-cols-4 border border-zinc-900">
            {[
              ['Transaction ref', p.txn.txnRef],
              ['Voucher date', formatDate(v.transferDate)],
              ['Customer', p.customer.customerName],
              ['CIF', p.customer.cifNo],
            ].map(([k, val], i) => (
              <div key={k} className={`p-1.5 ${i < 3 ? 'border-r border-zinc-900' : ''}`}>
                <p className="text-[9px] uppercase tracking-wide text-zinc-600">{k}</p>
                <p className="num font-semibold">{val}</p>
              </div>
            ))}
          </section>

          <section className="mt-3 border border-zinc-900">
            {v.rows.map((r, i) => (
              <div
                key={`${r.label}-${i}`}
                className={`grid grid-cols-[1fr_auto] ${i ? 'border-t border-zinc-300' : ''} ${r.kind === 'total' ? 'bg-zinc-100 font-bold' : ''}`}
              >
                <p className="px-2 py-1">
                  {r.label}
                  {r.note ? <span className="block text-[9px] italic">{r.note}</span> : null}
                </p>
                <p className="num px-2 py-1 text-right">{formatRowValue(r)}</p>
              </div>
            ))}
          </section>

          <section className="mt-3 border border-zinc-900 p-2">
            <p className="text-[9px] uppercase tracking-wide text-zinc-600">Amount in words</p>
            <p className="font-semibold">
              {p.amountInWords} <span className="num">({formatNaira(p.headlineAmount)})</span>
            </p>
          </section>

          {v.payment ? (
            <section className="mt-3 border border-zinc-900">
              <p className="border-b border-zinc-900 bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
                Payment instruction
              </p>
              <div className="grid grid-cols-3">
                {[
                  ['Beneficiary name', v.payment.benefName],
                  ['Bank', v.payment.bankName],
                  ['Account number', v.payment.accountNo],
                  ['Account type', v.payment.accountType === 'CURRENT' ? 'Current' : 'Savings'],
                  ['Amount', formatNaira(v.payment.amount)],
                  ['Transfer charge', formatNaira(v.payment.transferCharge)],
                ].map(([k, val], i) => (
                  <div
                    key={k}
                    className={`p-1.5 ${i % 3 !== 2 ? 'border-r border-zinc-300' : ''} ${i >= 3 ? 'border-t border-zinc-300' : ''}`}
                  >
                    <p className="text-[9px] uppercase tracking-wide text-zinc-600">{k}</p>
                    <p className="num">{val}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-3 border border-zinc-900 p-2">
            <p className="text-[9px] uppercase tracking-wide text-zinc-600">Remarks</p>
            <p>{v.remarks || '—'}</p>
            {p.instruction ? (
              <p className="mt-1 text-[10px] text-zinc-600">
                Instruction by {CHANNEL_LABELS[p.instruction.channel].toLowerCase()} received{' '}
                {formatDate(p.instruction.receivedDate)} · Purpose: {p.instruction.purpose}
              </p>
            ) : null}
          </section>

          <section className="mt-3 grid grid-cols-5 border border-zinc-900">
            {p.signatures.map((s, i) => (
              <div
                key={s.levelNo}
                className={`flex min-h-[70px] flex-col justify-between p-1.5 ${i < 4 ? 'border-r border-zinc-900' : ''}`}
              >
                <p className="text-[9px] font-bold uppercase tracking-wide">{s.roleLabel}</p>
                {s.signerName ? (
                  <div>
                    <p
                      className="text-[13px] italic"
                      style={{
                        fontFamily: "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', cursive",
                      }}
                    >
                      {s.signerName}
                    </p>
                    <p className="num text-[9px] text-zinc-600">{formatDateTime(s.signedAt)}</p>
                  </div>
                ) : (
                  <p className="text-[10px] text-zinc-500">Pending</p>
                )}
              </div>
            ))}
          </section>

          <section className="mt-3 grid grid-cols-3 border border-zinc-900">
            {[
              ['Eazybankz posting ref', p.execution?.cbsPostingRef ?? '—'],
              [
                'GAPS reference',
                p.execution?.gapsRef ?? (p.execution ? 'Internal – not applicable' : '—'),
              ],
              [
                'Executed by (Operations)',
                p.execution
                  ? `${p.execution.executedByName} · ${formatDateTime(p.execution.executedAt)}`
                  : 'Pending',
              ],
            ].map(([k, val], i) => (
              <div key={k} className={`p-1.5 ${i < 2 ? 'border-r border-zinc-900' : ''}`}>
                <p className="text-[9px] uppercase tracking-wide text-zinc-600">{k}</p>
                <p className="num">{val}</p>
              </div>
            ))}
          </section>

          <footer className="mt-3 flex justify-between text-[9px] text-zinc-500">
            <span>
              Printed {formatDateTime(new Date().toISOString())} by {user.fullName}
            </span>
            <span>
              {p.siblingCount > 1 ? `Voucher ${v.seqNo} of ${p.siblingCount}` : 'Single voucher'} ·
              Demo environment
            </span>
          </footer>
        </article>
      </div>
    </div>
  );
}
