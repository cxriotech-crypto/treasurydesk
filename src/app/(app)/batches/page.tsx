'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Send } from 'lucide-react';
import { scenarioLabel } from '@/domain/codes';
import { formatDateTime, formatNaira } from '@/lib/format';
import { add, ZERO } from '@/lib/money';
import { batchesService } from '@/services';
import type { BatchCandidate, BatchRow } from '@/services/batchesService';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Field,
  InlineAlert,
  Input,
  Modal,
  Money,
  PageHeader,
  SignatureModal,
  SkeletonRows,
  Textarea,
  toast,
  type Column,
} from '@/components/ui';
import { statusSummary } from './summary';

export default function BatchesPage() {
  const router = useRouter();
  const me = useCurrentUser();
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const q = useData(
    () => batchesService.list({ filters: { search: search || undefined } }),
    [search]
  );

  const columns: Column<BatchRow>[] = [
    { key: 'ref', header: 'Batch', cell: (r) => r.batchRef, card: 'title' },
    {
      key: 'items',
      header: 'Items',
      cell: (r) => <span className="num">{r.itemCount}</span>,
    },
    {
      key: 'status',
      header: 'Where the items are',
      cardLabel: 'Status',
      cell: (r) => <span className="text-xs">{statusSummary(r.statusCounts)}</span>,
    },
    {
      key: 'mine',
      header: 'Waiting for me',
      card: 'status',
      cell: (r) =>
        r.waitingForMe ? (
          <Badge tone="warning">{r.waitingForMe}</Badge>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    { key: 'maker', header: 'Submitted by', cell: (r) => r.makerName },
    {
      key: 'at',
      header: 'Submitted',
      cell: (r) => <span className="num">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: 'amount',
      header: 'Total',
      align: 'right',
      card: 'amount',
      cell: (r) => <Money value={r.totalAmount} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Batches"
        description="Transactions submitted together. Each level decides item by item: approved items move on, returned or rejected ones go back to the maker."
        actions={
          me?.roleCode === 'TO' ? (
            <Button variant="primary" icon={Layers} onClick={() => setNewOpen(true)}>
              New batch
            </Button>
          ) : null
        }
      />
      <DataTable
        caption="Batches"
        columns={columns}
        rows={q.data?.items}
        rowKey={(r) => r.id}
        rowHref={(r) => `/batches/${r.id}`}
        loading={q.loading}
        error={q.error}
        onRetry={q.reload}
        empty={{
          title: 'No batches yet',
          description:
            me?.roleCode === 'TO'
              ? 'Choose several ready transactions and submit them together with one signature.'
              : 'Batches appear here once Treasury submits transactions together.',
        }}
        toolbar={
          <Input
            type="search"
            aria-label="Search batches"
            placeholder="Search batch or maker"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
        }
      />
      {me?.roleCode === 'TO' ? (
        <NewBatchModal
          open={newOpen}
          onClose={() => setNewOpen(false)}
          onDone={(id) => {
            setNewOpen(false);
            router.push(`/batches/${id}`);
          }}
        />
      ) : null}
    </>
  );
}

/** Choose ready transactions and submit them together with one signature. */
function NewBatchModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (batchId: string) => void;
}) {
  const c = useData(
    () => (open ? batchesService.candidates() : Promise.resolve([] as BatchCandidate[])),
    [open]
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [signOpen, setSignOpen] = useState(false);
  const ready = (c.data ?? []).filter((x) => !x.blocker);
  const notReady = (c.data ?? []).filter((x) => x.blocker);
  const chosen = useMemo(() => ready.filter((x) => picked.has(x.id)), [ready, picked]);
  const toggle = (id: string, on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  return (
    <>
      <Modal
        open={open && !signOpen}
        onClose={onClose}
        size="lg"
        title="New batch"
        description="Pick the transactions to submit together. Only ones that are ready to sign can go in."
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              icon={Send}
              disabledReason={chosen.length >= 2 ? null : 'Choose at least two'}
              onClick={() => setSignOpen(true)}
            >
              Sign and submit {chosen.length || ''}
            </Button>
          </>
        }
      >
        {c.loading ? (
          <SkeletonRows rows={4} />
        ) : (
          <div className="space-y-4">
            {ready.length ? (
              <div className="rounded-md border border-border">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <Checkbox
                    checked={chosen.length === ready.length}
                    onChange={(on) => setPicked(on ? new Set(ready.map((x) => x.id)) : new Set())}
                    label={`Ready to sign (${ready.length})`}
                  />
                </div>
                <ul className="divide-y divide-border">
                  {ready.map((x) => (
                    <li
                      key={x.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3"
                    >
                      <Checkbox
                        checked={picked.has(x.id)}
                        onChange={(on) => toggle(x.id, on)}
                        label={`${x.txnRef} · ${x.customerName}`}
                        description={scenarioLabel(x.scenarioCode)}
                      />
                      <Money value={x.headlineAmt} className="text-[13px]" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <InlineAlert tone="info" title="Nothing is ready yet">
                A transaction is ready once its instruction, signature check, Eazybankz check and
                voucher are complete.
              </InlineAlert>
            )}
            {notReady.length ? (
              <div>
                <p className="mb-1 text-[13px] font-semibold text-muted">Not ready</p>
                <ul className="divide-y divide-border rounded-md border border-border text-[13px]">
                  {notReady.map((x) => (
                    <li key={x.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <span>
                        {x.txnRef} · {x.customerName}
                      </span>
                      <span className="text-xs text-muted">{x.blocker}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Field label="Note (optional)" hint="Shown to every approver who opens the batch">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
      <SignatureModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        title={`Submit ${chosen.length} transactions together`}
        description="One signature submits every transaction. Each goes to its customer's Account Officer first."
        actionLabel="Sign & submit"
        summary={
          <div className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">
            {chosen.slice(0, 6).map((x) => (
              <p key={x.id} className="flex justify-between gap-3">
                <span>{x.txnRef}</span>
                <span className="num">{formatNaira(x.headlineAmt)}</span>
              </p>
            ))}
            {chosen.length > 6 ? <p className="text-muted">and {chosen.length - 6} more</p> : null}
            <p className="mt-1 flex justify-between gap-3 border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span className="num">
                {formatNaira(add(ZERO, ...chosen.map((x) => x.headlineAmt)))}
              </span>
            </p>
          </div>
        }
        onSign={async (sig) => {
          const r = await batchesService.submit(
            chosen.map((x) => x.id),
            sig,
            note
          );
          setSignOpen(false);
          setPicked(new Set());
          setNote('');
          if (r.failed.length)
            toast.warning(
              `${r.batch?.batchRef}: ${r.submitted.length} submitted, ${r.failed.length} not`,
              r.failed.map((f) => `${f.txnRef}: ${f.reason}`).join('; ')
            );
          else
            toast.success(`${r.batch?.batchRef} submitted`, `${r.submitted.length} transactions`);
          if (r.batch) onDone(r.batch.id);
        }}
      />
    </>
  );
}
