'use client';

import { useState } from 'react';
import { CheckCircle2, CornerUpLeft, KeyRound, Send } from 'lucide-react';
import { nowIso } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { operationsService, transactionsService } from '@/services';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Badge,
  Button,
  Drawer,
  Field,
  InlineAlert,
  Input,
  SkeletonRows,
  Textarea,
  toast,
} from '@/components/ui';

function demoRef(): string {
  return `EZB-${nowIso().slice(0, 10).replace(/-/g, '')}-${String(Date.now() % 100000).padStart(5, '0')}`;
}

const STATUS_BADGE = {
  PREPARED: { tone: 'warning', label: 'Awaiting approval' },
  SUCCESS: { tone: 'success', label: 'Executed' },
  FAILED: { tone: 'danger', label: 'Failed' },
  RETURNED: { tone: 'neutral', label: 'Sent back' },
} as const;

/**
 * Operations, in two steps by two people: one officer keys the Eazybankz posting reference, a
 * different officer approves it — which executes it, sending it to GAPS where money leaves the bank.
 */
export function ExecuteDrawer({
  txnId,
  open,
  onClose,
}: {
  txnId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const me = useCurrentUser();
  const detail = useData(
    () => (txnId ? transactionsService.get(txnId) : Promise.resolve(null)),
    [txnId]
  );
  const steps = useData(
    () => (txnId ? operationsService.instructions(txnId) : Promise.resolve([])),
    [txnId]
  );
  const [ref, setRef] = useState('');
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = detail.data;
  const gaps = d?.gapsRequired ?? false;
  const status = d?.txn.status;
  const keying = status === 'PENDING_OPERATIONS' || status === 'EXEC_FAILED';
  const approving = status === 'PENDING_OPS_APPROVAL';
  const done = !!d && !keying && !approving;
  const prepared = d?.executions.find((e) => e.status === 'PREPARED');
  const lastFail = d?.executions.filter((e) => e.status === 'FAILED').pop();
  const lastReturn = d?.executions.filter((e) => e.status === 'RETURNED').pop();

  const key = async () => {
    if (!txnId || !d) return;
    if (!ref.trim()) {
      setError('Enter the Eazybankz posting reference');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await operationsService.prepare(txnId, ref, d.txn.version);
      toast.success('Posting keyed', 'A second Operations officer must now approve it.');
      setRef('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!txnId || !d) return;
    setBusy(true);
    setError(null);
    try {
      const r = await operationsService.approve(txnId, d.txn.version);
      if (r.ok)
        toast.success(
          `${d.txn.txnRef} executed`,
          r.execution.gapsRef ? `GAPS reference ${r.execution.gapsRef}` : 'Posted in Eazybankz'
        );
      else toast.error('GAPS submission failed', r.execution.failureReason ?? undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async () => {
    if (!txnId || !d) return;
    setBusy(true);
    setError(null);
    try {
      await operationsService.returnPosting(txnId, reason, d.txn.version);
      toast.success('Posting sent back', 'The officer who keyed it has been told why.');
      setReturning(false);
      setReason('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const blocker = approving ? d?.actions.opsApprove : keying ? d?.actions.execute : null;

  return (
    <Drawer
      open={open}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      title={
        d
          ? approving
            ? `Approve posting · ${d.txn.txnRef}`
            : `Key posting · ${d.txn.txnRef}`
          : 'Operations'
      }
      description={d ? d.customer.customerName : undefined}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        ) : returning ? (
          <>
            <Button onClick={() => setReturning(false)} disabled={busy}>
              Back
            </Button>
            <Button
              variant="danger"
              icon={CornerUpLeft}
              loading={busy}
              disabledReason={reason.trim() ? null : 'Say what needs correcting'}
              onClick={() => void sendBack()}
            >
              Send back
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            {approving ? (
              <>
                <Button
                  icon={CornerUpLeft}
                  disabledReason={blocker ?? null}
                  onClick={() => setReturning(true)}
                >
                  Send back
                </Button>
                <Button
                  variant="primary"
                  icon={gaps ? Send : CheckCircle2}
                  loading={busy}
                  disabledReason={blocker ?? null}
                  onClick={() => void approve()}
                >
                  {busy && gaps
                    ? 'Sending to GAPS…'
                    : gaps
                      ? 'Approve and send to GAPS'
                      : 'Approve and post'}
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                icon={KeyRound}
                loading={busy}
                disabledReason={blocker ?? null}
                onClick={() => void key()}
              >
                Key posting
              </Button>
            )}
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
          ) : approving && prepared ? (
            <InlineAlert tone="info" title="Keyed, awaiting a second officer">
              {prepared.executedByName} keyed{' '}
              <span className="num font-medium">{prepared.cbsPostingRef}</span> at{' '}
              {formatDateTime(prepared.executedAt)}.{' '}
              {prepared.executedBy === me?.id
                ? 'Another Operations officer must approve it.'
                : 'Check it against the instructions below before approving.'}
            </InlineAlert>
          ) : lastFail && status === 'EXEC_FAILED' ? (
            <InlineAlert tone="danger" title="Last GAPS submission failed">
              {lastFail.failureReason} · {formatDateTime(lastFail.executedAt)}. Key it again for a
              second officer to approve.
            </InlineAlert>
          ) : lastReturn && keying ? (
            <InlineAlert tone="warning" title="Sent back by the approving officer">
              {lastReturn.approvedByName}: {lastReturn.failureReason}
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
          {keying ? (
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
          {returning ? (
            <Field label="What needs correcting" required>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          ) : null}
          {error && (ref.trim() || !keying) ? (
            <InlineAlert tone="danger">{error}</InlineAlert>
          ) : null}
          {blocker && !done ? <InlineAlert tone="info">{blocker}.</InlineAlert> : null}
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
                      #{e.attemptNo} · keyed by {e.executedByName}
                      {e.approvedByName ? ` · approved by ${e.approvedByName}` : ''}
                      <span className="block text-xs text-muted">
                        <span className="num">{formatDateTime(e.executedAt)}</span> ·{' '}
                        {e.cbsPostingRef}
                        {e.gapsRef ? ` · ${e.gapsRef}` : ''}
                        {e.failureReason ? ` · ${e.failureReason}` : ''}
                      </span>
                    </span>
                    <Badge tone={STATUS_BADGE[e.status].tone}>{STATUS_BADGE[e.status].label}</Badge>
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
