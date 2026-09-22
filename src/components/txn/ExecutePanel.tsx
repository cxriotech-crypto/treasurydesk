'use client';

import { useState } from 'react';
import { CheckCircle2, RotateCw, Send } from 'lucide-react';
import { nowIso } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { operationsService, transactionsService } from '@/services';
import { useData } from '@/services/useData';
import {
  Badge,
  Button,
  Drawer,
  Field,
  InlineAlert,
  Input,
  SkeletonRows,
  toast,
} from '@/components/ui';

function demoRef(): string {
  return `EZB-${nowIso().slice(0, 10).replace(/-/g, '')}-${String(Date.now() % 100000).padStart(5, '0')}`;
}

/** Operations: plain-language posting instructions, Eazybankz ref, GAPS submission with retry. */
export function ExecuteDrawer({
  txnId,
  open,
  onClose,
}: {
  txnId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const detail = useData(
    () => (txnId ? transactionsService.get(txnId) : Promise.resolve(null)),
    [txnId]
  );
  const steps = useData(
    () => (txnId ? operationsService.instructions(txnId) : Promise.resolve([])),
    [txnId]
  );
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = detail.data;
  const gaps = d?.gapsRequired ?? false;
  const done = d && !['PENDING_OPERATIONS', 'EXEC_FAILED'].includes(d.txn.status);

  const run = async () => {
    if (!txnId || !d) return;
    if (!ref.trim()) {
      setError('Enter the Eazybankz posting reference');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = gaps
        ? await operationsService.sendToGaps(txnId, ref, d.txn.version)
        : await operationsService.executeInternal(txnId, ref, d.txn.version);
      if (r.ok) {
        toast.success(
          `${d.txn.txnRef} executed`,
          r.execution.gapsRef ? `GAPS reference ${r.execution.gapsRef}` : 'Posted in Eazybankz'
        );
      } else {
        toast.error('GAPS submission failed', r.execution.failureReason ?? undefined);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lastFail = d?.executions.filter((e) => e.status === 'FAILED').pop();

  return (
    <Drawer
      open={open}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      title={d ? `Execute ${d.txn.txnRef}` : 'Execute'}
      description={d ? `${d.customer.customerName}` : undefined}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={d?.txn.status === 'EXEC_FAILED' ? RotateCw : gaps ? Send : CheckCircle2}
              loading={busy}
              onClick={run}
              disabled={!d}
            >
              {busy && gaps
                ? 'Sending to GAPS…'
                : d?.txn.status === 'EXEC_FAILED'
                  ? 'Retry GAPS submission'
                  : gaps
                    ? 'Send to GAPS'
                    : 'Mark executed'}
            </Button>
          </>
        )
      }
    >
      {!d ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="space-y-4">
          {done ? (
            <InlineAlert tone="success" title="Executed">
              {d.txn.txnRef} was executed. The Treasury Officer has been asked to confirm
              completion.
            </InlineAlert>
          ) : lastFail && d.txn.status === 'EXEC_FAILED' ? (
            <InlineAlert tone="danger" title="Last GAPS submission failed">
              {lastFail.failureReason} · {formatDateTime(lastFail.executedAt)}. Correct the issue
              and retry.
            </InlineAlert>
          ) : null}
          <div>
            <p className="mb-2 text-[13px] font-semibold">What to post</p>
            {steps.loading ? (
              <SkeletonRows rows={3} />
            ) : (
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                {(steps.data ?? []).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </div>
          {!done ? (
            <Field
              label="Eazybankz posting reference"
              required
              error={error && !ref.trim() ? error : null}
              aside={
                <button
                  type="button"
                  className="text-xs font-medium text-brand hover:underline"
                  onClick={() => setRef(demoRef())}
                >
                  Use demo reference
                </button>
              }
            >
              <Input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="EZB-YYYYMMDD-00000"
                autoComplete="off"
              />
            </Field>
          ) : null}
          {error && ref.trim() ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <Badge tone={gaps ? 'info' : 'neutral'}>
              {gaps ? 'External payment via GAPS' : 'Internal only – no GAPS'}
            </Badge>
          </div>
          {d.executions.length ? (
            <div>
              <p className="mb-2 text-[13px] font-semibold">Attempts</p>
              <ul className="divide-y divide-border rounded-md border border-border text-[13px]">
                {d.executions.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <span>
                      #{e.attemptNo} · {e.executedByName} ·{' '}
                      <span className="num">{formatDateTime(e.executedAt)}</span>
                      <span className="block text-xs text-muted">
                        {e.cbsPostingRef}
                        {e.gapsRef ? ` · ${e.gapsRef}` : ''}
                        {e.failureReason ? ` · ${e.failureReason}` : ''}
                      </span>
                    </span>
                    <Badge tone={e.status === 'SUCCESS' ? 'success' : 'danger'}>
                      {e.status === 'SUCCESS' ? 'Success' : 'Failed'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
