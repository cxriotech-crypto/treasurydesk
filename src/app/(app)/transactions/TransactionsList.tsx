'use client';

import { useMemo, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Filter, Plus, X } from 'lucide-react';
import type { SortDir } from '@/domain/types';
import {
  SCENARIO_CODES,
  SCENARIO_META,
  TXN_STATUS_META,
  TXN_TYPES,
  TXN_TYPE_META,
  scenarioLabel,
  type ScenarioCode,
  type TxnStatus,
  type TxnType,
} from '@/domain/codes';
import { formatDateTime } from '@/lib/format';
import { toCsv, downloadFile } from '@/lib/csv';
import { todayLagos } from '@/lib/dates';
import { customersService, transactionsService, usersService } from '@/services';
import { useCurrentUser, useData } from '@/services/useData';
import type { TxnFilters, TxnRow } from '@/services/transactionsService';
import { useDisclosure } from '@/components/hooks';
import {
  BottomSheet,
  Button,
  Checkbox,
  Combobox,
  DataTable,
  DateInput,
  DateText,
  Field,
  Input,
  LinkButton,
  Money,
  MoneyInput,
  PageHeader,
  Select,
  SlaBadge,
  Tabs,
  TxnStatusBadge,
  Badge,
  toastError,
  type Column,
} from '@/components/ui';

const PAGE_SIZE = 25;

const TABS: { key: string; label: string; statuses: TxnStatus[] | null }[] = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'progress', label: 'In progress', statuses: ['DRAFT', 'VERIFICATION', 'RETURNED'] },
  {
    key: 'approval',
    label: 'Awaiting approval',
    statuses: ['PENDING_HEAD_TREASURY', 'PENDING_MIS', 'PENDING_AUDIT', 'PENDING_MD'],
  },
  { key: 'ops', label: 'Operations', statuses: ['PENDING_OPERATIONS', 'EXEC_FAILED', 'EXECUTED'] },
  { key: 'completed', label: 'Completed', statuses: ['COMPLETED'] },
  {
    key: 'closed',
    label: 'Stopped / rejected / cancelled',
    statuses: ['STOPPED', 'REJECTED', 'CANCELLED'],
  },
];

export function TransactionsList() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const me = useCurrentUser();
  const sheet = useDisclosure();

  const p = (k: string) => sp.get(k) ?? '';
  const tab = TABS.find((t) => t.key === p('tab')) ?? TABS[0];
  const status = p('status') as TxnStatus | '';
  const page = Math.max(1, Number(p('page')) || 1);
  const sort = { field: p('sort') || 'createdAt', dir: (p('dir') || 'desc') as SortDir };

  const filters: TxnFilters = useMemo(
    () => ({
      search: p('q') || undefined,
      status: status ? status : (tab.statuses ?? undefined),
      txnType: (p('type') as TxnType) || undefined,
      scenarioCode: (p('scenario') as ScenarioCode) || undefined,
      customerId: p('customer') || undefined,
      makerId: p('maker') || undefined,
      dateFrom: p('from') || undefined,
      dateTo: p('to') || undefined,
      amountMin: p('min') || undefined,
      amountMax: p('max') || undefined,
      slaBreached: p('sla') === '1' ? true : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sp]
  );
  const key = JSON.stringify(filters);

  const set = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const list = useData(
    () => transactionsService.list({ filters, page, pageSize: PAGE_SIZE, sort }),
    [key, page, sort.field, sort.dir]
  );
  const counts = useData(
    () => transactionsService.statusCounts((({ status: _s, ...rest }) => rest)(filters)),
    [key]
  );
  const customers = useData(() => customersService.list({ pageSize: 1000 }), []);
  const makers = useData(() => usersService.list({ filters: { roleCode: 'TO' } }), []);

  const tabCount = (t: (typeof TABS)[number]) =>
    counts.data
      ? t.statuses
        ? t.statuses.reduce((s, st) => s + counts.data![st], 0)
        : counts.data.ALL
      : undefined;

  const exportCsv = async () => {
    try {
      const all = await transactionsService.list({ filters, sort });
      downloadFile(
        `transactions-${todayLagos()}.csv`,
        toCsv(all.items, [
          { header: 'Reference', value: (r) => r.txnRef },
          { header: 'Created', value: (r) => formatDateTime(r.createdAt) },
          { header: 'Customer', value: (r) => r.customerName },
          { header: 'CIF', value: (r) => r.cifNo },
          { header: 'Transaction', value: (r) => scenarioLabel(r.scenarioCode) },
          { header: 'Status', value: (r) => TXN_STATUS_META[r.status].label },
          { header: 'Amount', value: (r) => r.headlineAmt },
          { header: 'Maker', value: (r) => r.makerName },
          { header: 'SLA', value: (r) => r.sla?.label ?? '' },
        ])
      );
    } catch (e) {
      toastError(e);
    }
  };

  const columns: Column<TxnRow>[] = [
    { key: 'ref', header: 'Reference', cell: (r) => r.txnRef, sortKey: 'txnRef', card: 'title' },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <TxnStatusBadge status={r.status} />,
      sortKey: 'status',
      card: 'status',
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => <span className="block max-w-[14rem] truncate">{r.customerName}</span>,
      sortKey: 'customerName',
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
      key: 'created',
      header: 'Created',
      cell: (r) => <DateText value={r.createdAt} time />,
      sortKey: 'createdAt',
    },
    {
      key: 'sla',
      header: 'SLA',
      cell: (r) =>
        ['STOPPED', 'REJECTED', 'CANCELLED'].includes(r.status) ? '—' : <SlaBadge sla={r.sla} />,
    },
    {
      key: 'maker',
      header: 'Maker',
      cell: (r) => r.makerName,
      className: 'hidden xl:table-cell',
      card: 'hidden',
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (r) => <Money value={r.headlineAmt} />,
      sortKey: 'headlineAmt',
      align: 'right',
      card: 'amount',
    },
  ];

  const filterFields = (
    <>
      <Field label="Transaction type">
        <Select
          value={p('type')}
          placeholder="All types"
          onChange={(e) => set({ type: e.target.value, scenario: null })}
          options={TXN_TYPES.map((t) => ({ value: t, label: TXN_TYPE_META[t].label }))}
        />
      </Field>
      <Field label="Scenario">
        <Select
          value={p('scenario')}
          placeholder="All scenarios"
          onChange={(e) => set({ scenario: e.target.value })}
          options={SCENARIO_CODES.filter(
            (s) => !p('type') || SCENARIO_META[s].txnType === p('type')
          ).map((s) => ({ value: s, label: scenarioLabel(s) }))}
        />
      </Field>
      <Field label="Customer">
        <Combobox
          clearable
          value={p('customer')}
          onChange={(v) => set({ customer: v })}
          placeholder="Any customer"
          options={(customers.data?.items ?? []).map((c) => ({
            value: c.id,
            label: c.customerName,
            sublabel: c.cifNo,
            keywords: c.cifNo,
          }))}
        />
      </Field>
      <Field label="Maker">
        <Select
          value={p('maker')}
          placeholder="Any maker"
          onChange={(e) => set({ maker: e.target.value })}
          options={(makers.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
        />
      </Field>
      <Field label="Created from">
        <DateInput value={p('from')} onChange={(e) => set({ from: e.target.value })} />
      </Field>
      <Field label="Created to">
        <DateInput value={p('to')} onChange={(e) => set({ to: e.target.value })} />
      </Field>
      <Field label="Amount from">
        <MoneyInput value={p('min')} onValueChange={(v) => set({ min: v })} placeholder="0.00" />
      </Field>
      <Field label="Amount to">
        <MoneyInput value={p('max')} onValueChange={(v) => set({ max: v })} placeholder="Any" />
      </Field>
      <div className="flex items-end">
        <Checkbox
          checked={p('sla') === '1'}
          onChange={(v) => set({ sla: v ? '1' : null })}
          label="SLA breached only"
        />
      </div>
    </>
  );

  const active: { key: string; label: ReactNode }[] = [];
  if (status) active.push({ key: 'status', label: `Status: ${TXN_STATUS_META[status].label}` });
  if (p('type')) active.push({ key: 'type', label: TXN_TYPE_META[p('type') as TxnType]?.label });
  if (p('scenario'))
    active.push({ key: 'scenario', label: scenarioLabel(p('scenario') as ScenarioCode) });
  if (p('customer'))
    active.push({
      key: 'customer',
      label: customers.data?.items.find((c) => c.id === p('customer'))?.customerName ?? 'Customer',
    });
  if (p('maker'))
    active.push({
      key: 'maker',
      label: `Maker: ${makers.data?.items.find((u) => u.id === p('maker'))?.fullName ?? ''}`,
    });
  if (p('from') || p('to'))
    active.push({ key: 'dates', label: `Created ${p('from') || '…'} – ${p('to') || '…'}` });
  if (p('min') || p('max')) active.push({ key: 'amount', label: 'Amount range' });
  if (p('sla') === '1') active.push({ key: 'sla', label: 'SLA breached' });

  const clearOne = (k: string) =>
    set(
      k === 'dates'
        ? { from: null, to: null }
        : k === 'amount'
          ? { min: null, max: null }
          : { [k]: null }
    );
  const clearAll = () =>
    router.replace(`${pathname}${p('tab') ? `?tab=${p('tab')}` : ''}`, { scroll: false });

  return (
    <>
      <PageHeader
        title="Transactions"
        description={
          me?.roleCode === 'AO'
            ? 'Transactions for your customers.'
            : 'Every treasury transaction and where it is in the approval chain.'
        }
        actions={
          me?.roleCode === 'TO' ? (
            <LinkButton href="/transactions/new" variant="primary" icon={Plus}>
              New transaction
            </LinkButton>
          ) : null
        }
      />
      <Tabs
        label="Status"
        value={status ? '' : tab.key}
        onChange={(k) => set({ tab: k === 'all' ? null : k, status: null })}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: tabCount(t) }))}
      />
      <div className="mt-4">
        <DataTable
          caption="Transactions"
          columns={columns}
          rows={list.data?.items}
          rowKey={(r) => r.id}
          rowHref={(r) => `/transactions/${r.id}`}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          sort={sort}
          onSortChange={(s) => set({ sort: s.field, dir: s.dir })}
          page={page}
          pageSize={PAGE_SIZE}
          total={list.data?.total}
          onPageChange={(n) => set({ page: String(n) }, false)}
          onExport={exportCsv}
          empty={{
            title: 'No transactions match',
            description: active.length || p('q') ? 'Try removing a filter.' : 'Nothing here yet.',
            action:
              active.length || p('q') ? (
                <Button size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : undefined,
          }}
          toolbar={
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  type="search"
                  aria-label="Search transactions"
                  placeholder="Search reference, customer, CIF, investment"
                  defaultValue={p('q')}
                  onChange={(e) => set({ q: e.target.value })}
                  className="md:max-w-sm"
                />
                <Button icon={Filter} className="lg:hidden" onClick={sheet.onOpen}>
                  Filters{active.length ? ` (${active.length})` : ''}
                </Button>
              </div>
              <div className="hidden grid-cols-2 gap-3 lg:grid xl:grid-cols-5">{filterFields}</div>
              {active.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {active.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => clearOne(f.key)}
                      className="inline-flex items-center gap-1 rounded"
                      aria-label={`Remove filter ${typeof f.label === 'string' ? f.label : f.key}`}
                    >
                      <Badge tone="info">
                        {f.label} <X size={12} aria-hidden />
                      </Badge>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="text-xs font-medium text-muted hover:text-fg"
                    onClick={clearAll}
                  >
                    Clear all
                  </button>
                </div>
              ) : null}
            </div>
          }
        />
      </div>
      <BottomSheet
        open={sheet.open}
        onClose={sheet.onClose}
        title="Filters"
        footer={
          <>
            <Button onClick={clearAll}>Clear all</Button>
            <Button variant="primary" onClick={sheet.onClose}>
              Show {list.data?.total ?? ''} results
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{filterFields}</div>
      </BottomSheet>
    </>
  );
}
