'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { CUSTOMER_TYPE_LABELS, type CustomerType } from '@/domain/codes';
import { todayLagos } from '@/lib/dates';
import { downloadFile, toCsv } from '@/lib/csv';
import { customersService, usersService } from '@/services';
import type { CustomerRow } from '@/services/customersService';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Badge,
  DataTable,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  toastError,
  type Column,
} from '@/components/ui';
import { Button } from '@/components/ui';
import { CustomerForm } from './CustomerForm';

const PAGE_SIZE = 25;

export function CustomersList() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const me = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const p = (k: string) => sp.get(k) ?? '';
  const page = Math.max(1, Number(p('page')) || 1);
  const sort = { field: p('sort') || 'cifNo', dir: (p('dir') || 'asc') as 'asc' | 'desc' };
  const filters = {
    search: p('q') || undefined,
    customerType: (p('type') as CustomerType) || undefined,
    accountOfficerId: p('officer') || undefined,
    status: (p('status') as 'ACTIVE' | 'INACTIVE') || undefined,
    whtExempt: p('wht') === '1' ? true : undefined,
  };
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
    () => customersService.list({ filters, page, pageSize: PAGE_SIZE, sort }),
    [key, page, sort.field, sort.dir]
  );
  const officers = useData(() => usersService.list({ filters: { roleCode: 'AO' } }), []);
  const canEdit = me?.roleCode === 'TO' || me?.roleCode === 'ADM';

  const columns: Column<CustomerRow>[] = [
    { key: 'cif', header: 'CIF', cell: (r) => r.cifNo, sortKey: 'cifNo' },
    {
      key: 'name',
      header: 'Customer',
      cell: (r) => (
        <span className="block max-w-[16rem] truncate font-medium">{r.customerName}</span>
      ),
      sortKey: 'customerName',
      card: 'title',
    },
    {
      key: 'type',
      header: 'Type',
      cell: (r) => <Badge>{CUSTOMER_TYPE_LABELS[r.customerType]}</Badge>,
      card: 'status',
    },
    { key: 'phone', header: 'Phone', cell: (r) => <span className="num">{r.regPhone}</span> },
    {
      key: 'officer',
      header: 'Account Officer',
      cell: (r) => r.officerName,
      className: 'hidden xl:table-cell',
      card: 'hidden',
    },
    {
      key: 'wht',
      header: 'WHT',
      cell: (r) => (r.whtExempt ? <Badge tone="info">Exempt</Badge> : '—'),
    },
    { key: 'inv', header: 'Investments', cell: (r) => r.activeInvestments, align: 'right' },
    {
      key: 'aum',
      header: 'AUM',
      cell: (r) => <Money value={r.aum} />,
      align: 'right',
      card: 'amount',
    },
  ];

  const exportCsv = async () => {
    try {
      const all = await customersService.list({ filters, sort });
      downloadFile(
        `customers-${todayLagos()}.csv`,
        toCsv(all.items, [
          { header: 'CIF', value: (r) => r.cifNo },
          { header: 'Customer', value: (r) => r.customerName },
          { header: 'Type', value: (r) => CUSTOMER_TYPE_LABELS[r.customerType] },
          { header: 'Phone', value: (r) => r.regPhone },
          { header: 'Email', value: (r) => r.email },
          { header: 'Account Officer', value: (r) => r.officerName },
          { header: 'WHT exempt', value: (r) => (r.whtExempt ? 'Yes' : 'No') },
          { header: 'Active investments', value: (r) => r.activeInvestments },
          { header: 'AUM', value: (r) => r.aum },
          { header: 'Status', value: (r) => r.status },
        ])
      );
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <PageHeader
        title="Customers"
        description="Profiles, mandates, accounts and investments."
        actions={
          canEdit ? (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New customer
            </Button>
          ) : null
        }
      />
      <DataTable
        caption="Customers"
        columns={columns}
        rows={list.data?.items}
        rowKey={(r) => r.id}
        rowHref={(r) => `/customers/${r.id}`}
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
        empty={{ title: 'No customers match', description: 'Try a different search or filter.' }}
        toolbar={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Input
              type="search"
              aria-label="Search customers"
              placeholder="Search name, CIF, phone, email"
              defaultValue={p('q')}
              onChange={(e) => set({ q: e.target.value })}
            />
            <Field label="Type">
              <Select
                value={p('type')}
                placeholder="All types"
                onChange={(e) => set({ type: e.target.value })}
                options={[
                  { value: 'IND', label: 'Individual' },
                  { value: 'CORP', label: 'Corporate' },
                ]}
              />
            </Field>
            <Field label="Account Officer">
              <Select
                value={p('officer')}
                placeholder="Any officer"
                onChange={(e) => set({ officer: e.target.value })}
                options={(officers.data?.items ?? []).map((u) => ({
                  value: u.id,
                  label: u.fullName,
                }))}
              />
            </Field>
            <Field label="Status">
              <Select
                value={p('status')}
                placeholder="Any status"
                onChange={(e) => set({ status: e.target.value })}
                options={[
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'INACTIVE', label: 'Inactive' },
                ]}
              />
            </Field>
          </div>
        }
      />
      <CustomerForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(c) => router.push(`/customers/${c.id}`)}
      />
    </>
  );
}
