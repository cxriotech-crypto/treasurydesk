'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PhoneCall } from 'lucide-react';
import { CALLBACK_OUTCOME_LABELS, type CallbackOutcome } from '@/domain/codes';
import { todayLagos } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { downloadFile, toCsv } from '@/lib/csv';
import { callbacksService, transactionsService } from '@/services';
import type { CallbackRow } from '@/services/callbacksService';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  DateInput,
  Field,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  SlaBadge,
  toastError,
  type Column,
} from '@/components/ui';
import { CallbackForm } from '@/components/txn/CallbackForm';

const PAGE_SIZE = 25;

export default function CallbacksPage() {
  const me = useCurrentUser();
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<CallbackOutcome | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [logFor, setLogFor] = useState<string | null>(null);

  const filters = {
    search: search || undefined,
    outcome: outcome || undefined,
    dateFrom: from || undefined,
    dateTo: to || undefined,
  };
  const list = useData(
    () => callbacksService.list({ filters, page, pageSize: PAGE_SIZE }),
    [JSON.stringify(filters), page]
  );
  const queue = useData(() => callbacksService.queue(), []);
  const detail = useData(
    () => (logFor ? transactionsService.get(logFor) : Promise.resolve(null)),
    [logFor]
  );
  const canLog = me?.roleCode === 'AO' || me?.roleCode === 'TO';

  const columns: Column<CallbackRow>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (r) => (
        <span className="num">
          {formatDate(r.callDate)} {r.callTime}
        </span>
      ),
      card: 'title',
    },
    {
      key: 'outcome',
      header: 'Outcome',
      cell: (r) => (
        <Badge
          tone={
            r.outcome === 'CONFIRMED' ? 'success' : r.outcome === 'DISPUTED' ? 'danger' : 'warning'
          }
        >
          {CALLBACK_OUTCOME_LABELS[r.outcome]}
        </Badge>
      ),
      card: 'status',
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => <span className="block max-w-[14rem] truncate">{r.customerName}</span>,
    },
    {
      key: 'txn',
      header: 'Transaction',
      cell: (r) => (
        <Link href={`/transactions/${r.txnId}`} className="hover:underline">
          {r.txnRef}
        </Link>
      ),
    },
    {
      key: 'phone',
      header: 'Phone called',
      cell: (r) => <span className="num">{r.phoneCalled}</span>,
    },
    { key: 'officer', header: 'Officer', cell: (r) => r.officerName },
    {
      key: 'checks',
      header: 'Confirmed',
      cell: (r) =>
        [
          r.amountOk && 'Amount',
          r.instrOk && 'Instruction',
          r.benefOk && 'Beneficiary',
          r.purposeOk && 'Purpose',
        ]
          .filter(Boolean)
          .join(', ') || '—',
      cardLabel: 'Confirmed',
    },
  ];

  const exportCsv = async () => {
    try {
      const all = await callbacksService.list({ filters });
      downloadFile(
        `callbacks-${todayLagos()}.csv`,
        toCsv(all.items, [
          { header: 'Date', value: (r) => r.callDate },
          { header: 'Time', value: (r) => r.callTime },
          { header: 'Transaction', value: (r) => r.txnRef },
          { header: 'Customer', value: (r) => r.customerName },
          { header: 'CIF', value: (r) => r.cifNo },
          { header: 'Phone called', value: (r) => r.phoneCalled },
          { header: 'Officer', value: (r) => r.officerName },
          { header: 'Outcome', value: (r) => CALLBACK_OUTCOME_LABELS[r.outcome] },
          { header: 'Notes', value: (r) => r.notes },
        ])
      );
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <PageHeader
        title="Call-backs"
        description="Every customer confirmation call, and the calls still waiting."
      />

      <Card className="mb-5">
        <CardHeader
          title="Waiting for a call"
          description={
            queue.data
              ? `${queue.data.length} transaction${queue.data.length === 1 ? '' : 's'} in verification`
              : undefined
          }
        />
        {queue.data?.length ? (
          <ul className="divide-y divide-border">
            {queue.data.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <span className="min-w-0">
                  <Link
                    href={`/transactions/${r.id}`}
                    className="block text-sm font-medium hover:underline"
                  >
                    {r.txnRef} · {r.customerName}
                  </Link>
                  <span className="num block text-xs text-muted">
                    {r.regPhone}
                    {r.attempts
                      ? ` · ${r.attempts} attempt${r.attempts === 1 ? '' : 's'} (${r.lastOutcome?.toLowerCase()})`
                      : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <SlaBadge sla={r.sla} />
                  <Button
                    size="sm"
                    icon={PhoneCall}
                    disabledReason={
                      canLog ? null : 'Only Account Officers and Treasury Officers log calls'
                    }
                    onClick={() => setLogFor(r.id)}
                  >
                    Log call
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No calls waiting" />
        )}
      </Card>

      <DataTable
        caption="Call-back log"
        columns={columns}
        rows={list.data?.items}
        rowKey={(r) => r.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        page={page}
        pageSize={PAGE_SIZE}
        total={list.data?.total}
        onPageChange={setPage}
        onExport={exportCsv}
        empty={{
          title: 'No calls logged',
          description: 'Calls appear here once an officer records one.',
        }}
        toolbar={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Input
              type="search"
              aria-label="Search call-backs"
              placeholder="Search customer, phone, reference"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Field label="Outcome">
              <Select
                value={outcome}
                placeholder="Any outcome"
                onChange={(e) => setOutcome(e.target.value as CallbackOutcome)}
                options={(Object.keys(CALLBACK_OUTCOME_LABELS) as CallbackOutcome[]).map((o) => ({
                  value: o,
                  label: CALLBACK_OUTCOME_LABELS[o],
                }))}
              />
            </Field>
            <Field label="From">
              <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <DateInput value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        }
      />

      <Modal
        open={!!logFor}
        onClose={() => setLogFor(null)}
        size="lg"
        title="Log call-back"
        description={
          detail.data
            ? `${detail.data.customer.customerName} · ${detail.data.customer.regPhone}`
            : undefined
        }
      >
        {detail.data ? (
          <CallbackForm
            txnId={detail.data.txn.id}
            customer={detail.data.customer}
            onSaved={() => setLogFor(null)}
          />
        ) : null}
      </Modal>
    </>
  );
}
