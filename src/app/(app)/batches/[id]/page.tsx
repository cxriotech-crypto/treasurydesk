'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { levelForRole, scenarioLabel } from '@/domain/codes';
import { formatDateTime, formatNaira } from '@/lib/format';
import { batchesService } from '@/services';
import type { BatchItem } from '@/services/batchesService';
import type { BatchAction } from '@/services/workflow';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Button,
  DataTable,
  ErrorState,
  InlineAlert,
  Input,
  KpiGrid,
  KpiTile,
  Money,
  PageHeader,
  Segmented,
  SignatureModal,
  SkeletonRows,
  TxnStatusBadge,
  toast,
  type Column,
} from '@/components/ui';
import { statusSummary } from '../summary';

type Choice = BatchAction | 'SKIP';

export default function BatchPage() {
  const { id } = useParams<{ id: string }>();
  const me = useCurrentUser();
  const q = useData(() => batchesService.get(id), [id]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [signOpen, setSignOpen] = useState(false);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <SkeletonRows rows={10} />;
  const b = q.data;
  const level = me ? levelForRole(me.roleCode) : undefined;
  const mine = b.items.filter((x) => x.canDecide);
  const choiceOf = (x: BatchItem): Choice => choices[x.id] ?? 'SKIP';
  const decisions = mine
    .filter((x) => choiceOf(x) !== 'SKIP')
    .map((x) => ({
      txnId: x.id,
      action: choiceOf(x) as BatchAction,
      comment: comments[x.id]?.trim() || undefined,
    }));
  const missingReason = decisions.some((d) => d.action !== 'APPROVE' && !d.comment);
  const count = (a: BatchAction) => decisions.filter((d) => d.action === a).length;

  const columns: Column<BatchItem>[] = [
    {
      key: 'ref',
      header: 'Reference',
      card: 'title',
      cell: (r) => (
        <Link
          href={`/transactions/${r.id}`}
          className="whitespace-nowrap font-medium text-brand hover:underline"
        >
          {r.txnRef}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => <span className="block max-w-[14rem] truncate">{r.customerName}</span>,
    },
    {
      key: 'type',
      header: 'Transaction',
      cardLabel: 'Type',
      cell: (r) => (
        <span className="block max-w-[14rem] truncate">{scenarioLabel(r.scenarioCode)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      card: 'status',
      cell: (r) => <TxnStatusBadge status={r.status} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      card: 'amount',
      cell: (r) => <Money value={r.headlineAmt} />,
    },
    ...(mine.length
      ? [
          {
            key: 'decide',
            header: 'Your decision',
            cardLabel: 'Decision',
            cell: (r: BatchItem) =>
              r.canDecide ? (
                <div className="min-w-[17rem] space-y-1.5">
                  <Segmented<Choice>
                    label={`Decision for ${r.txnRef}`}
                    value={choiceOf(r)}
                    onChange={(v) => setChoices((c) => ({ ...c, [r.id]: v }))}
                    options={[
                      { value: 'SKIP', label: 'Later' },
                      {
                        value: 'APPROVE',
                        label: 'Approve',
                        disabled: !!r.approveBlocker,
                      },
                      { value: 'RETURN', label: 'Return' },
                      { value: 'REJECT', label: 'Reject' },
                    ]}
                  />
                  {r.approveBlocker && choiceOf(r) === 'SKIP' ? (
                    <p className="text-xs text-st-warning-fg">
                      {r.approveBlocker} —{' '}
                      <Link href={`/transactions/${r.id}`} className="underline">
                        open it
                      </Link>
                    </p>
                  ) : null}
                  {choiceOf(r) === 'RETURN' || choiceOf(r) === 'REJECT' ? (
                    <Input
                      aria-label={`Reason for ${r.txnRef}`}
                      placeholder={
                        choiceOf(r) === 'RETURN' ? 'What needs correcting?' : 'Why rejected?'
                      }
                      value={comments[r.id] ?? ''}
                      onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))}
                    />
                  ) : null}
                </div>
              ) : (
                <span className="text-xs text-muted">{r.decideBlocker}</span>
              ),
          } satisfies Column<BatchItem>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={b.batchRef}
        description={`Submitted by ${b.makerName} on ${formatDateTime(b.createdAt)}${b.note ? ` · ${b.note}` : ''}`}
        crumbs={[{ label: 'Batches', href: '/batches' }, { label: b.batchRef }]}
        actions={
          mine.length ? (
            <Button
              variant="primary"
              icon={PenLine}
              disabledReason={
                !decisions.length
                  ? 'Choose a decision for at least one item'
                  : missingReason
                    ? 'Give a reason for every item you return or reject'
                    : null
              }
              onClick={() => setSignOpen(true)}
            >
              Sign {decisions.length ? `${decisions.length} decision(s)` : 'decisions'}
            </Button>
          ) : null
        }
      />
      <div className="mb-5">
        <KpiGrid>
          <KpiTile label="Items" value={b.itemCount} />
          <KpiTile label="Total value" value={b.totalAmount} kind="money" />
          <KpiTile
            label="Waiting for you"
            value={b.waitingForMe}
            tone={b.waitingForMe ? 'warning' : 'default'}
          />
        </KpiGrid>
        <p className="mt-2 text-[13px] text-muted">
          Where they are: {statusSummary(b.statusCounts)}
        </p>
      </div>
      {mine.length ? (
        <div className="mb-4">
          <InlineAlert
            tone="info"
            title={`${mine.length} item(s) waiting for you${level ? ` as ${level.label}` : ''}`}
          >
            Choose a decision for each. Approved items move on to the next level; returned and
            rejected items go back to {b.makerName}. Items you leave as “Later” stay with you.
          </InlineAlert>
        </div>
      ) : null}
      <DataTable caption="Batch items" columns={columns} rows={b.items} rowKey={(r) => r.id} />
      <SignatureModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        title={`Sign your decisions on ${b.batchRef}`}
        description={`${count('APPROVE')} approve · ${count('RETURN')} return · ${count('REJECT')} reject. One signature covers them all.`}
        actionLabel="Sign decisions"
        summary={
          <div className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">
            {decisions.map((d) => {
              const it = b.items.find((x) => x.id === d.txnId)!;
              return (
                <p key={d.txnId} className="flex justify-between gap-3">
                  <span>
                    {it.txnRef} ·{' '}
                    {d.action === 'APPROVE'
                      ? 'Approve'
                      : d.action === 'RETURN'
                        ? 'Return'
                        : 'Reject'}
                  </span>
                  <span className="num">{formatNaira(it.headlineAmt)}</span>
                </p>
              );
            })}
          </div>
        }
        onSign={async (sig) => {
          const r = await batchesService.decide(b.id, decisions, sig);
          setSignOpen(false);
          setChoices({});
          setComments({});
          if (r.failed.length)
            toast.warning(
              `${r.done.length} done, ${r.failed.length} not`,
              r.failed.map((f) => `${f.txnRef}: ${f.reason}`).join('; ')
            );
          else toast.success(`${r.done.length} decision(s) signed`);
          q.reload();
        }}
      />
    </>
  );
}
