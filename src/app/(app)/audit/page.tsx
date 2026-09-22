'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ROLE_LABELS, type RoleCode } from '@/domain/codes';
import { todayLagos } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { downloadFile, toCsv } from '@/lib/csv';
import { auditService, usersService } from '@/services';
import type { AuditRow } from '@/services/auditService';
import type { IntegrityResult } from '@/data/audit';
import { useData } from '@/services/useData';
import {
  Badge,
  Button,
  DataTable,
  DateInput,
  Field,
  InlineAlert,
  Input,
  PageHeader,
  Select,
  toastError,
  type Column,
} from '@/components/ui';

const PAGE_SIZE = 25;

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [checking, setChecking] = useState(false);

  const filters = {
    search: search || undefined,
    entity: entity || undefined,
    action: action || undefined,
    userId: userId || undefined,
    dateFrom: from || undefined,
    dateTo: to || undefined,
  };
  const list = useData(
    () => auditService.list({ filters, page, pageSize: PAGE_SIZE }),
    [JSON.stringify(filters), page]
  );
  const facets = useData(() => auditService.facets(), []);
  const users = useData(() => usersService.list({ pageSize: 100 }), []);

  const columns: Column<AuditRow>[] = [
    { key: 'seq', header: '#', cell: (r) => <span className="num text-muted">{r.seqNo}</span> },
    {
      key: 'ts',
      header: 'When',
      cell: (r) => <span className="num whitespace-nowrap">{formatDateTime(r.ts)}</span>,
      card: 'title',
    },
    {
      key: 'user',
      header: 'User',
      cell: (r) =>
        `${r.userName}${r.roleCode === 'SYSTEM' ? '' : ` (${ROLE_LABELS[r.roleCode as RoleCode] ?? r.roleCode})`}`,
    },
    { key: 'action', header: 'Action', cell: (r) => <Badge>{r.action}</Badge>, card: 'status' },
    { key: 'entity', header: 'Entity', cell: (r) => <span className="num">{r.entity}</span> },
    {
      key: 'summary',
      header: 'Summary',
      cell: (r) => <span className="block max-w-[28rem] truncate">{r.summary}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      cell: (r) => <span className="num text-muted">{r.ipAddr}</span>,
      className: 'hidden xl:table-cell',
      card: 'hidden',
    },
    {
      key: 'diff',
      header: <span className="sr-only">Changes</span>,
      cell: (r) =>
        r.before || r.after ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(open === r.id ? null : r.id)}
            aria-expanded={open === r.id}
          >
            {open === r.id ? 'Hide' : 'Changes'}
          </Button>
        ) : null,
      cardLabel: 'Changes',
    },
  ];

  const exportCsv = async () => {
    try {
      const all = await auditService.list({ filters });
      downloadFile(
        `audit-${todayLagos()}.csv`,
        toCsv(all.items, [
          { header: 'Seq', value: (r) => r.seqNo },
          { header: 'Timestamp', value: (r) => r.ts },
          { header: 'User', value: (r) => r.userName },
          { header: 'Role', value: (r) => r.roleCode },
          { header: 'Entity', value: (r) => r.entity },
          { header: 'Entity id', value: (r) => r.entityId },
          { header: 'Action', value: (r) => r.action },
          { header: 'Summary', value: (r) => r.summary },
          { header: 'IP', value: (r) => r.ipAddr },
          { header: 'Hash', value: (r) => r.hash },
        ])
      );
    } catch (e) {
      toastError(e);
    }
  };

  const verify = async () => {
    setChecking(true);
    try {
      setIntegrity(await auditService.verifyIntegrity());
    } catch (e) {
      toastError(e);
    } finally {
      setChecking(false);
    }
  };

  const expanded = list.data?.items.find((r) => r.id === open);

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every write is recorded and hash-chained. Records cannot be edited or deleted."
        actions={
          <Button variant="primary" icon={ShieldCheck} loading={checking} onClick={verify}>
            Verify integrity
          </Button>
        }
      />
      {integrity ? (
        <div className="mb-4">
          <InlineAlert
            tone={integrity.ok ? 'success' : 'danger'}
            title={integrity.ok ? 'Integrity verified' : 'Integrity check failed'}
          >
            {integrity.message}
          </InlineAlert>
        </div>
      ) : null}
      {expanded ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[13px] font-semibold">Before</p>
            <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 text-xs">
              {JSON.stringify(expanded.before ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-[13px] font-semibold">After</p>
            <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 text-xs">
              {JSON.stringify(expanded.after ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
      <DataTable
        caption="Audit events"
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
        empty={{ title: 'No events match', description: 'Try a wider date range.' }}
        toolbar={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Input
              type="search"
              aria-label="Search audit"
              placeholder="Search summary, id, action"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="xl:col-span-2"
            />
            <Field label="Entity">
              <Select
                value={entity}
                placeholder="All entities"
                onChange={(e) => setEntity(e.target.value)}
                options={(facets.data?.entities ?? []).map((v) => ({ value: v, label: v }))}
              />
            </Field>
            <Field label="Action">
              <Select
                value={action}
                placeholder="All actions"
                onChange={(e) => setAction(e.target.value)}
                options={(facets.data?.actions ?? []).map((v) => ({ value: v, label: v }))}
              />
            </Field>
            <Field label="User">
              <Select
                value={userId}
                placeholder="Any user"
                onChange={(e) => setUserId(e.target.value)}
                options={(users.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From">
                <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To">
                <DateInput value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
          </div>
        }
      />
    </>
  );
}
