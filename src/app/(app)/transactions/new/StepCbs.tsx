'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { formatTime } from '@/lib/format';
import { transactionsService } from '@/services';
import type { CbsSnapshot } from '@/services/transactionsService';
import { Button, Checkbox, InlineAlert, SkeletonRows, toast } from '@/components/ui';
import { formatRowValue } from '@/components/txn/VoucherView';
import type { StepProps } from './Wizard';

export function StepCbs({ detail, goTo }: StepProps) {
  const { txn, verification } = detail;
  const inflow = txn.scenarioCode === 'INFLOW';
  const [snap, setSnap] = useState<CbsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(verification?.cbsConfirmed ?? false);
  const [funds, setFunds] = useState(verification?.fundsReceived ?? false);
  const [source, setSource] = useState(verification?.sourceConfirmed ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setSnap(await transactionsService.refreshFromCbs(txn.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const already = !!verification?.cbsConfirmed;
  const ok = (already && !snap) || (!!snap && confirmed && (!inflow || (funds && source)));

  const submit = async () => {
    if (!snap) {
      if (already) goTo(6);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await transactionsService.confirmCbs(txn.id, {
        cbsSyncedAt: snap.syncedAt,
        fundsReceived: funds,
        sourceConfirmed: source,
      });
      toast.success('Confirmed in Eazybankz');
      goTo(6);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Check the figures against Eazybankz before raising the voucher.
        </p>
        <Button icon={RefreshCw} loading={loading} onClick={refresh}>
          Refresh from Eazybankz
        </Button>
      </div>
      {loading && !snap ? (
        <SkeletonRows rows={5} />
      ) : snap ? (
        <div className="rounded-md border border-border">
          <div className="divide-y divide-border">
            {snap.lines.map((l) => (
              <div
                key={l.label}
                className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2"
              >
                <span className="text-[13px] text-muted">{l.label}</span>
                <span className="num text-sm">{formatRowValue(l)}</span>
              </div>
            ))}
            {inflow && !snap.lines.length ? (
              <p className="px-3 py-2 text-[13px] text-muted">
                New investment — no existing position.
              </p>
            ) : null}
          </div>
          <p className="num border-t border-border px-3 py-2 text-xs text-muted">
            Last synced {formatTime(snap.syncedAt)} (read-only)
          </p>
        </div>
      ) : (
        <InlineAlert tone="info">Refresh from Eazybankz to load the current position.</InlineAlert>
      )}

      <fieldset className="rounded-md border border-border p-3" disabled={!snap}>
        <legend className="px-1 text-[13px] font-semibold">Confirmation</legend>
        {inflow ? (
          <>
            <Checkbox
              checked={funds}
              onChange={setFunds}
              disabled={!snap}
              label="Funds received"
              description="The customer's money has arrived"
            />
            <Checkbox
              checked={source}
              onChange={setSource}
              disabled={!snap}
              label="Source account confirmed"
            />
          </>
        ) : null}
        <Checkbox
          checked={confirmed}
          onChange={setConfirmed}
          disabled={!snap}
          label="Figures confirmed in Eazybankz"
          description="Principal, interest, rate, dates and balances match"
        />
      </fieldset>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
        <Button icon={ArrowLeft} onClick={() => goTo(4)}>
          Back
        </Button>
        <Button
          variant="primary"
          iconRight={ArrowRight}
          disabled={!ok}
          loading={busy}
          onClick={submit}
        >
          Continue to voucher
        </Button>
      </div>
    </div>
  );
}
