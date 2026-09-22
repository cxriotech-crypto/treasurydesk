'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PlayCircle, RotateCw } from 'lucide-react';
import { scenarioLabel } from '@/domain/codes';
import { operationsService } from '@/services';
import { useData } from '@/services/useData';
import type { OpsRow } from '@/services/operationsService';
import {
  Badge,
  Button,
  DataTable,
  DateText,
  Input,
  KpiGrid,
  KpiTile,
  Money,
  PageHeader,
  Select,
  TxnStatusBadge,
  type Column,
} from '@/components/ui';
import { ExecuteDrawer } from '@/components/txn/ExecutePanel';

function OperationsQueue() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const open = sp.get('txn');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | 'PENDING_OPERATIONS' | 'EXEC_FAILED'>('');
  const q = useData(
    () =>
      operationsService.queue({
        filters: { search: search || undefined, status: status || undefined },
      }),
    [search, status]
  );
  const all = useData(() => operationsService.queue(), []);
  const failed = all.data?.items.filter((r) => r.status === 'EXEC_FAILED').length ?? 0;

  const setOpen = (id: string | null) =>
    router.replace(id ? `${pathname}?txn=${id}` : pathname, { scroll: false });

  const columns: Column<OpsRow>[] = [
    { key: 'ref', header: 'Reference', cell: (r) => r.txnRef, card: 'title' },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <TxnStatusBadge status={r.status} />,
      card: 'status',
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => <span className="block max-w-[14rem] truncate">{r.customerName}</span>,
    },
    {
      key: 'type',
      header: 'Transaction',
      cell: (r) => (
        <span className="block max-w-[16rem] truncate">{scenarioLabel(r.scenarioCode)}</span>
      ),
      cardLabel: 'Type',
    },
    {
      key: 'channel',
      header: 'Channel',
      cell: (r) => (
        <Badge tone={r.gapsRequired ? 'info' : 'neutral'}>
          {r.gapsRequired ? 'GAPS' : 'Internal'}
        </Badge>
      ),
    },
    {
      key: 'approved',
      header: 'Approved',
      cell: (r) => <DateText value={r.updatedAt} time />,
      cardLabel: 'Approved',
    },
    {
      key: 'failure',
      header: 'Last failure',
      cell: (r) =>
        r.lastFailure ? <span className="text-xs text-st-danger-fg">{r.lastFailure}</span> : '—',
    },
    {
      key: 'pay',
      header: 'To pay',
      cell: (r) => <Money value={r.payoutAmt} />,
      align: 'right',
      card: 'amount',
    },
    {
      key: 'act',
      header: <span className="sr-only">Action</span>,
      cell: (r) => (
        <Button
          size="sm"
          variant={r.status === 'EXEC_FAILED' ? 'secondary' : 'primary'}
          icon={r.status === 'EXEC_FAILED' ? RotateCw : PlayCircle}
          onClick={() => setOpen(r.id)}
        >
          {r.status === 'EXEC_FAILED' ? 'Retry' : 'Execute'}
        </Button>
      ),
      cardLabel: 'Action',
    },
  ];

  return (
    <>
      <PageHeader
        title="Operations"
        description="Fully approved transactions to post in Eazybankz and pay through GAPS."
      />
      <div className="mb-5">
        <KpiGrid>
          <KpiTile
            label="Ready to execute"
            value={all.data ? all.data.total - failed : null}
            loading={all.loading}
          />
          <KpiTile
            label="GAPS failures"
            value={failed}
            tone={failed ? 'danger' : 'default'}
            loading={all.loading}
          />
          <KpiTile
            label="Total to pay"
            value={all.data?.totalToPay}
            kind="money"
            loading={all.loading}
          />
        </KpiGrid>
      </div>
      <DataTable
        caption="Execution queue"
        columns={columns}
        rows={q.data?.items}
        rowKey={(r) => r.id}
        rowHref={(r) => `/transactions/${r.id}`}
        loading={q.loading}
        error={q.error}
        onRetry={q.reload}
        empty={{
          title: 'Nothing to execute',
          description: 'Transactions appear here once the MD approves them.',
        }}
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="search"
              aria-label="Search"
              placeholder="Search reference or customer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <div className="sm:w-56">
              <Select
                aria-label="Status"
                value={status}
                placeholder="Ready and failed"
                onChange={(e) => setStatus(e.target.value as typeof status)}
                options={[
                  { value: 'PENDING_OPERATIONS', label: 'Ready for Operations' },
                  { value: 'EXEC_FAILED', label: 'Execution failed' },
                ]}
              />
            </div>
          </div>
        }
      />
      <ExecuteDrawer txnId={open} open={!!open} onClose={() => setOpen(null)} />
    </>
  );
}

export default function OperationsPage() {
  return (
    <Suspense>
      <OperationsQueue />
    </Suspense>
  );
}
