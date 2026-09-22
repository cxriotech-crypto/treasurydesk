'use client';

import { useMemo, useState } from 'react';
import { PenLine } from 'lucide-react';
import { TXN_TYPES, TXN_TYPE_META, scenarioLabel, type TxnType } from '@/domain/codes';
import { slaState } from '@/domain/rules';
import { formatDuration, formatNaira } from '@/lib/format';
import { nowIso } from '@/lib/dates';
import { add, ZERO } from '@/lib/money';
import { approvalsService } from '@/services';
import { useData } from '@/services/useData';
import type { ApprovalRow } from '@/services/approvalsService';
import { useNow } from '@/components/hooks';
import {
  Button,
  Checkbox,
  DataTable,
  Input,
  KpiGrid,
  KpiTile,
  Money,
  PageHeader,
  Select,
  SignatureModal,
  SlaBadge,
  Tooltip,
  toast,
  type Column,
} from '@/components/ui';

export default function ApprovalsPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TxnType | ''>('');
  const [breachedOnly, setBreachedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [signOpen, setSignOpen] = useState(false);
  useNow(30_000); // live SLA countdown

  const q = useData(
    () =>
      approvalsService.queue({
        filters: {
          search: search || undefined,
          txnType: type || undefined,
          slaBreached: breachedOnly || undefined,
        },
      }),
    [search, type, breachedOnly]
  );
  const rows = q.data?.items;
  const now = nowIso();
  const live = (r: ApprovalRow) => slaState(r.slaDueAt, now, null);
  const breached = (rows ?? []).filter((r) => live(r)?.breached).length;
  const chosen = useMemo(() => (rows ?? []).filter((r) => selected.has(r.id)), [rows, selected]);
  const chosenTotal = add(ZERO, ...chosen.map((r) => r.headlineAmt));

  const columns: Column<ApprovalRow>[] = [
    { key: 'ref', header: 'Reference', cell: (r) => r.txnRef, sortKey: 'txnRef', card: 'title' },
    { key: 'sla', header: 'SLA', cell: (r) => <SlaBadge sla={live(r)} />, card: 'status' },
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
    { key: 'maker', header: 'Maker', cell: (r) => r.makerName },
    {
      key: 'wait',
      header: 'Waiting',
      cell: (r) => <span className="num">{formatDuration(r.waitingMinutes)}</span>,
    },
    {
      key: 'check',
      header: 'Can sign',
      cell: (r) =>
        r.blocker ? (
          <Tooltip content={r.blocker}>
            <span className="text-xs text-st-warning-fg" tabIndex={0} aria-label={r.blocker}>
              Blocked
            </span>
          </Tooltip>
        ) : (
          <span className="text-xs text-st-success-fg">Yes</span>
        ),
      cardLabel: 'Can sign',
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (r) => <Money value={r.headlineAmt} />,
      align: 'right',
      card: 'amount',
    },
  ];

  return (
    <>
      <PageHeader
        title={q.data ? `Approvals · ${q.data.levelLabel}` : 'Approvals'}
        description="Transactions waiting for your signature. Open one to review it in full."
        actions={
          <Button
            variant="primary"
            icon={PenLine}
            disabled={!chosen.length}
            onClick={() => setSignOpen(true)}
          >
            Approve selected{chosen.length ? ` (${chosen.length})` : ''}
          </Button>
        }
      />
      <div className="mb-5">
        <KpiGrid>
          <KpiTile label="Pending my approval" value={q.data?.total} loading={q.loading} />
          <KpiTile
            label="Total value"
            value={q.data?.totalAmount}
            kind="money"
            loading={q.loading}
          />
          <KpiTile
            label="Oldest item"
            value={q.data ? (q.data.total ? formatDuration(q.data.oldestMinutes) : '—') : null}
            kind="text"
            loading={q.loading}
          />
          <KpiTile
            label="SLA breached"
            value={breached}
            tone={breached ? 'danger' : 'default'}
            loading={q.loading}
          />
        </KpiGrid>
      </div>
      <DataTable
        caption="Approval queue"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/transactions/${r.id}`}
        loading={q.loading}
        error={q.error}
        onRetry={q.reload}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        isSelectable={(r) => !r.blocker}
        empty={{
          title: 'Nothing waiting for you',
          description: 'New items appear here as soon as the previous level signs.',
        }}
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
                aria-label="Transaction type"
                value={type}
                placeholder="All types"
                onChange={(e) => setType(e.target.value as TxnType)}
                options={TXN_TYPES.map((t) => ({ value: t, label: TXN_TYPE_META[t].label }))}
              />
            </div>
            <Checkbox checked={breachedOnly} onChange={setBreachedOnly} label="SLA breached only" />
          </div>
        }
      />
      <SignatureModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        title={`Approve ${chosen.length} transaction${chosen.length === 1 ? '' : 's'}`}
        description="One signature approves every selected transaction at your level."
        actionLabel="Approve & sign"
        withComment
        summary={
          <div className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">
            {chosen.slice(0, 6).map((r) => (
              <p key={r.id} className="flex justify-between gap-3">
                <span>{r.txnRef}</span>
                <span className="num">{formatNaira(r.headlineAmt)}</span>
              </p>
            ))}
            {chosen.length > 6 ? <p className="text-muted">and {chosen.length - 6} more</p> : null}
            <p className="mt-1 flex justify-between gap-3 border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span className="num">{formatNaira(chosenTotal)}</span>
            </p>
          </div>
        }
        onSign={async (sig) => {
          const r = await approvalsService.bulkApprove(
            chosen.map((c) => c.id),
            sig
          );
          setSelected(new Set());
          if (r.failed.length)
            toast.warning(
              `${r.approved.length} approved, ${r.failed.length} not approved`,
              r.failed.map((f) => `${f.txnRef}: ${f.reason}`).join('; ')
            );
          else toast.success(`${r.approved.length} approved`);
        }}
      />
    </>
  );
}
