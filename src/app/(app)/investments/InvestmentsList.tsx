'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  INVESTMENT_STATUS_META,
  PRODUCT_LABELS,
  type InvestmentStatus,
  type ProductCode,
} from '@/domain/codes';
import { addDays, todayLagos } from '@/lib/dates';
import { formatDate, formatRate } from '@/lib/format';
import { downloadFile, toCsv } from '@/lib/csv';
import { customersService, investmentsService } from '@/services';
import type { InvestmentFilters, InvestmentRow } from '@/services/investmentsService';
import { useData } from '@/services/useData';
import {
  Button,
  Combobox,
  DataTable,
  DateInput,
  DateText,
  Field,
  Input,
  InvestmentStatusBadge,
  KpiGrid,
  KpiTile,
  Money,
  PageHeader,
  Select,
  Tabs,
  toastError,
  type Column,
} from '@/components/ui';

const PAGE_SIZE = 25;

const TABS = [
  { key: 'live', label: 'Live' },
  { key: 'today', label: 'Maturing today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'matured', label: 'Matured' },
  { key: 'anniv', label: 'Anniversary due' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
] as const;

export function InvestmentsList() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const p = (k: string) => sp.get(k) ?? '';
  const today = todayLagos();
  const tab = (TABS.find((t) => t.key === p('tab')) ?? TABS[0]).key;
  const page = Math.max(1, Number(p('page')) || 1);
  const sort = { field: p('sort') || 'maturityDate', dir: (p('dir') || 'asc') as 'asc' | 'desc' };

  const filters: InvestmentFilters = useMemo(() => {
    const base: InvestmentFilters = {
      search: p('q') || undefined,
      productCode: (p('product') as ProductCode) || undefined,
      customerId: p('customer') || undefined,
      maturityFrom: p('from') || undefined,
      maturityTo: p('to') || undefined,
    };
    if (tab === 'live') base.status = 'ACTIVE';
    if (tab === 'today')
      Object.assign(base, { status: 'ACTIVE', maturityFrom: today, maturityTo: today });
    if (tab === 'week')
      Object.assign(base, { status: 'ACTIVE', maturityFrom: today, maturityTo: addDays(today, 7) });
    if (tab === 'matured') base.status = 'MATURED';
    if (tab === 'anniv') Object.assign(base, { status: 'ACTIVE', annivWithinDays: 14 });
    if (tab === 'closed') base.status = (p('status') as InvestmentStatus) || undefined;
    if (p('status')) base.status = p('status') as InvestmentStatus;
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, tab]);
  const key = JSON.stringify(filters);

  const set = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const list = useData(
    () => investmentsService.list({ filters, page, pageSize: PAGE_SIZE, sort }),
    [key, page, sort.field, sort.dir]
  );
  const customers = useData(() => customersService.list({ pageSize: 1000 }), []);
  const summary = list.data?.summary;

  const columns: Column<InvestmentRow>[] = [
    {
      key: 'ref',
      header: 'Reference',
      cell: (r) => r.investmentRef,
      sortKey: 'investmentRef',
      card: 'title',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <InvestmentStatusBadge status={r.status} />,
      card: 'status',
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => <span className="block max-w-[14rem] truncate">{r.customerName}</span>,
      sortKey: 'customerName',
    },
    {
      key: 'product',
      header: 'Product',
      cell: (r) => PRODUCT_LABELS[r.productCode],
      sortKey: 'productCode',
    },
    {
      key: 'rate',
      header: 'Rate',
      cell: (r) => formatRate(r.intRate),
      sortKey: 'intRate',
      align: 'right',
    },
    {
      key: 'tenor',
      header: 'Tenor',
      cell: (r) => `${r.tenorDays}d`,
      sortKey: 'tenorDays',
      align: 'right',
    },
    {
      key: 'maturity',
      header: 'Maturity',
      cell: (r) => <DateText value={r.maturityDate} />,
      sortKey: 'maturityDate',
    },
    {
      key: 'anniv',
      header: 'Next anniversary',
      cell: (r) => (r.nextAnnivDate ? <DateText value={r.nextAnnivDate} /> : '—'),
      className: 'hidden xl:table-cell',
      card: 'hidden',
    },
    {
      key: 'accrued',
      header: 'Accrued interest',
      cell: (r) => <Money value={r.accruedInterest} />,
      sortKey: 'accruedInterest',
      align: 'right',
    },
    {
      key: 'principal',
      header: 'Principal',
      cell: (r) => <Money value={r.principalAmt} />,
      sortKey: 'principalAmt',
      align: 'right',
      card: 'amount',
    },
  ];

  const exportCsv = async () => {
    try {
      const all = await investmentsService.list({ filters, sort });
      downloadFile(
        `investments-${today}.csv`,
        toCsv(all.items, [
          { header: 'Reference', value: (r) => r.investmentRef },
          { header: 'Customer', value: (r) => r.customerName },
          { header: 'CIF', value: (r) => r.cifNo },
          { header: 'Product', value: (r) => PRODUCT_LABELS[r.productCode] },
          { header: 'Principal', value: (r) => r.principalAmt },
          { header: 'Rate', value: (r) => r.intRate },
          { header: 'Tenor (days)', value: (r) => r.tenorDays },
          { header: 'Effective', value: (r) => formatDate(r.effectiveDate) },
          { header: 'Maturity', value: (r) => formatDate(r.maturityDate) },
          { header: 'Accrued interest', value: (r) => r.accruedInterest },
          { header: 'Status', value: (r) => INVESTMENT_STATUS_META[r.status].label },
        ])
      );
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <PageHeader title="Investments" description="The live book with interest accrued to today." />
      <div className="mb-5">
        <KpiGrid>
          <KpiTile label="Investments (filtered)" value={summary?.count} loading={list.loading} />
          <KpiTile
            label="Principal"
            value={summary?.principal}
            kind="money"
            loading={list.loading}
          />
          <KpiTile
            label="Accrued interest"
            value={summary?.accruedInterest}
            kind="money"
            loading={list.loading}
          />
          <KpiTile
            label="Projected interest"
            value={summary?.projectedInterest}
            kind="money"
            loading={list.loading}
          />
        </KpiGrid>
      </div>
      <Tabs
        label="Investment view"
        value={tab}
        onChange={(k) => set({ tab: k === 'live' ? null : k, status: null })}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
      />
      <div className="mt-4">
        <DataTable
          caption="Investments"
          columns={columns}
          rows={list.data?.items}
          rowKey={(r) => r.id}
          rowHref={(r) => `/investments/${r.id}`}
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
            title: 'No investments match',
            description: 'Try another tab or clear the filters.',
          }}
          toolbar={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Input
                type="search"
                aria-label="Search investments"
                placeholder="Search reference, customer, CIF"
                defaultValue={p('q')}
                onChange={(e) => set({ q: e.target.value })}
              />
              <Field label="Product">
                <Select
                  value={p('product')}
                  placeholder="All products"
                  onChange={(e) => set({ product: e.target.value })}
                  options={(Object.keys(PRODUCT_LABELS) as ProductCode[]).map((v) => ({
                    value: v,
                    label: PRODUCT_LABELS[v],
                  }))}
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
              <Field label="Maturity from">
                <DateInput value={p('from')} onChange={(e) => set({ from: e.target.value })} />
              </Field>
              <Field label="Maturity to">
                <DateInput value={p('to')} onChange={(e) => set({ to: e.target.value })} />
              </Field>
            </div>
          }
        />
      </div>
      {p('q') || p('product') || p('customer') || p('from') || p('to') ? (
        <div className="mt-3">
          <Button size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
            Clear filters
          </Button>
        </div>
      ) : null}
    </>
  );
}
