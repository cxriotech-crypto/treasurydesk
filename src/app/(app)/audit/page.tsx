'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Flag, RotateCcw, ShieldCheck } from 'lucide-react';
import { ROLE_LABELS, type RoleCode } from '@/domain/codes';
import type { AuditReviewStatus } from '@/domain/types';
import { todayLagos } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { downloadFile, toCsv } from '@/lib/csv';
import { auditService, usersService } from '@/services';
import type { AuditReviewView, AuditRow } from '@/services/auditService';
import type { IntegrityResult } from '@/data/audit';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DateInput,
  Field,
  InlineAlert,
  Input,
  KpiGrid,
  KpiTile,
  PageHeader,
  Select,
  toast,
  toastError,
  type Column,
} from '@/components/ui';

const PAGE_SIZE = 25;

const REVIEW_LABEL: Record<AuditReviewStatus, string> = {
  VERIFIED: 'Verified',
  FLAGGED: 'Flagged',
  NOT_REVIEWED: 'Not reviewed',
};

function ReviewBadge({ review }: { review: AuditReviewView | null }) {
  if (!review) return <Badge>Not reviewed</Badge>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Badge tone={review.status === 'VERIFIED' ? 'success' : 'danger'}>
        {REVIEW_LABEL[review.status]}
      </Badge>
      <span className="whitespace-nowrap text-xs text-muted">
        {review.reviewedByName} · {formatDateTime(review.reviewedAt)}
      </span>
    </span>
  );
}

function ReviewHistory({ eventId }: { eventId: string }) {
  const h = useData(() => auditService.reviewHistory(eventId), [eventId]);
  if (!h.data) return null;
  if (!h.data.length) return <p className="text-[13px] text-muted">Never reviewed.</p>;
  return (
    <ol className="space-y-1 text-[13px]">
      {h.data.map((r, i) => (
        <li key={i}>
          <span className="font-medium">{REVIEW_LABEL[r.status]}</span> by {r.reviewedByName} ·{' '}
          <span className="num">{formatDateTime(r.reviewedAt)}</span>
          {r.note ? ` — ${r.note}` : ''}
        </li>
      ))}
    </ol>
  );
}

function AuditTrail() {
  const sp = useSearchParams();
  const me = useCurrentUser();
  const isAuditor = me?.roleCode === 'AUD';
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [review, setReview] = useState<AuditReviewStatus | ''>(
    (sp.get('review') as AuditReviewStatus | null) ?? ''
  );
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<AuditReviewStatus | null>(null);

  const filters = {
    search: search || undefined,
    entity: entity || undefined,
    action: action || undefined,
    userId: userId || undefined,
    dateFrom: from || undefined,
    dateTo: to || undefined,
    review: review || undefined,
  };
  const list = useData(
    () => auditService.list({ filters, page, pageSize: PAGE_SIZE }),
    [JSON.stringify(filters), page]
  );
  const counts = useData(() => auditService.reviewCounts(), []);
  const facets = useData(() => auditService.facets(), []);
  const users = useData(() => usersService.list({ pageSize: 100 }), []);
  const setFilter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const columns: Column<AuditRow>[] = [
    { key: 'seq', header: '#', cell: (r) => <span className="num text-muted">{r.seqNo}</span> },
    {
      key: 'ts',
      header: 'When',
      cell: (r) => <span className="num whitespace-nowrap">{formatDateTime(r.ts)}</span>,
      card: 'title',
    },
    {
      key: 'review',
      header: 'Review',
      cell: (r) => <ReviewBadge review={r.review} />,
      card: 'status',
    },
    {
      key: 'user',
      header: 'User',
      cell: (r) => (
        <span className="block min-w-[9rem]">
          {r.userName}
          {r.roleCode === 'SYSTEM' ? null : (
            <span className="block text-xs text-muted">
              {ROLE_LABELS[r.roleCode as RoleCode] ?? r.roleCode}
            </span>
          )}
        </span>
      ),
    },
    { key: 'action', header: 'Action', cell: (r) => <Badge>{r.action}</Badge> },
    {
      key: 'summary',
      header: 'Summary',
      cell: (r) => <span className="block max-w-[26rem] truncate">{r.summary}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      cell: (r) => <span className="num text-muted">{r.ipAddr}</span>,
      className: 'hidden 2xl:table-cell',
      card: 'hidden',
    },
    {
      key: 'diff',
      header: <span className="sr-only">Details</span>,
      cell: (r) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen(open === r.id ? null : r.id)}
          aria-expanded={open === r.id}
          aria-label={`${open === r.id ? 'Hide' : 'Show'} details of entry ${r.seqNo}`}
        >
          {open === r.id ? 'Hide' : 'Details'}
        </Button>
      ),
      cardLabel: 'Details',
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
          { header: 'Review', value: (r) => REVIEW_LABEL[r.review?.status ?? 'NOT_REVIEWED'] },
          { header: 'Reviewed by', value: (r) => r.review?.reviewedByName ?? '' },
          { header: 'Reviewed at', value: (r) => r.review?.reviewedAt ?? '' },
          { header: 'Review note', value: (r) => r.review?.note ?? '' },
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

  const applyReview = async (status: AuditReviewStatus, note: string) => {
    const r = await auditService.review([...selected], status, note);
    setSelected(new Set());
    counts.reload();
    const verb =
      status === 'VERIFIED'
        ? 'marked verified'
        : status === 'FLAGGED'
          ? 'flagged'
          : 'put back to not reviewed';
    if (r.skipped.length)
      toast.warning(
        `${r.done.length} ${verb}, ${r.skipped.length} left as they were`,
        r.skipped
          .slice(0, 6)
          .map((s) => `#${s.seqNo}: ${s.reason}`)
          .join('; ')
      );
    else toast.success(`${r.done.length} entr${r.done.length === 1 ? 'y' : 'ies'} ${verb}`);
  };

  const expanded = list.data?.items.find((r) => r.id === open);
  const n = selected.size;
  const c = counts.data;

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every write is recorded and cannot be edited or deleted. Internal Audit reviews entries one by one or in bulk."
        actions={
          <Button icon={ShieldCheck} loading={checking} onClick={verify}>
            Verify integrity
          </Button>
        }
      />
      <div className="mb-4">
        <InlineAlert tone="info" title="Two different checks">
          <span className="block">
            <span className="font-medium">Verify integrity</span> checks that no entry has been
            changed or deleted since it was written. Each entry carries a fingerprint of its own
            contents and of the entry before it, so altering any one entry breaks every fingerprint
            after it. It checks the whole trail in one go and says nothing about whether anyone has
            looked at the entries.
          </span>
          <span className="mt-1 block">
            <span className="font-medium">Review</span> is Internal Audit’s own sign-off: select
            entries and mark them verified, flag the ones that need explaining, and leave the rest.
            Each entry shows who reviewed it and when; a flagged entry stays flagged until it is
            verified.
          </span>
        </InlineAlert>
      </div>
      {integrity ? (
        <div className="mb-4">
          <InlineAlert
            tone={integrity.ok ? 'success' : 'danger'}
            title={integrity.ok ? 'No entry has been altered' : 'An entry has been altered'}
          >
            {integrity.message}
          </InlineAlert>
        </div>
      ) : null}
      <div className="mb-5">
        <KpiGrid>
          <KpiTile label="Entries" value={c?.total} loading={counts.loading} />
          <KpiTile label="Verified" value={c?.verified} loading={counts.loading} />
          <KpiTile
            label="Flagged"
            value={c?.flagged}
            tone={c && c.flagged ? 'danger' : 'default'}
            loading={counts.loading}
          />
          <KpiTile
            label="Not reviewed"
            value={c?.notReviewed}
            tone={c && c.notReviewed ? 'warning' : 'default'}
            loading={counts.loading}
          />
        </KpiGrid>
      </div>
      {expanded ? (
        <div className="mb-4 space-y-3 rounded-md border border-border p-3">
          <p className="text-[13px]">
            <span className="font-semibold">Entry #{expanded.seqNo}</span> · {expanded.entity}{' '}
            <span className="num">{expanded.entityId}</span> · {expanded.summary}
          </p>
          {expanded.before || expanded.after ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1 text-[13px] font-semibold">Before</p>
                <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 text-xs">
                  {JSON.stringify(expanded.before ?? {}, null, 2)}
                </pre>
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[13px] font-semibold">After</p>
                <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 text-xs">
                  {JSON.stringify(expanded.after ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
          <div>
            <p className="mb-1 text-[13px] font-semibold">Review history</p>
            <ReviewHistory eventId={expanded.id} />
          </div>
        </div>
      ) : null}
      {isAuditor ? (
        <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <span className="min-w-0 text-[13px] text-muted">
            {n
              ? `${n} entr${n === 1 ? 'y' : 'ies'} selected`
              : 'Select entries to review them. Your own actions are reviewed by another auditor.'}
          </span>
          <div className="flex shrink-0 flex-wrap gap-2">
            {n ? (
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            ) : null}
            <Button
              icon={RotateCcw}
              disabledReason={n ? null : 'Select entries first'}
              onClick={() => setDialog('NOT_REVIEWED')}
            >
              Mark not reviewed
            </Button>
            <Button
              icon={Flag}
              disabledReason={n ? null : 'Select entries first'}
              onClick={() => setDialog('FLAGGED')}
            >
              Flag
            </Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              disabledReason={n ? null : 'Select entries first'}
              onClick={() => setDialog('VERIFIED')}
            >
              Mark verified{n ? ` (${n})` : ''}
            </Button>
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
        selectable={isAuditor}
        selected={selected}
        onSelectedChange={setSelected}
        isSelectable={(r) => !r.reviewBlocker}
        empty={{ title: 'No entries match', description: 'Try a wider date range.' }}
        toolbar={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Input
              type="search"
              aria-label="Search audit"
              placeholder="Search summary, id, action"
              value={search}
              onChange={(e) => setFilter(setSearch)(e.target.value)}
              className="sm:col-span-2"
            />
            <Field label="Review status">
              <Select
                value={review}
                placeholder="Any"
                onChange={(e) => setFilter(setReview)(e.target.value as AuditReviewStatus | '')}
                options={(['NOT_REVIEWED', 'VERIFIED', 'FLAGGED'] as const).map((v) => ({
                  value: v,
                  label: REVIEW_LABEL[v],
                }))}
              />
            </Field>
            <Field label="User">
              <Select
                value={userId}
                placeholder="Any user"
                onChange={(e) => setFilter(setUserId)(e.target.value)}
                options={(users.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
              />
            </Field>
            <Field label="Entity">
              <Select
                value={entity}
                placeholder="All entities"
                onChange={(e) => setFilter(setEntity)(e.target.value)}
                options={(facets.data?.entities ?? []).map((v) => ({ value: v, label: v }))}
              />
            </Field>
            <Field label="Action">
              <Select
                value={action}
                placeholder="All actions"
                onChange={(e) => setFilter(setAction)(e.target.value)}
                options={(facets.data?.actions ?? []).map((v) => ({ value: v, label: v }))}
              />
            </Field>
            <Field label="From">
              <DateInput value={from} onChange={(e) => setFilter(setFrom)(e.target.value)} />
            </Field>
            <Field label="To">
              <DateInput value={to} onChange={(e) => setFilter(setTo)(e.target.value)} />
            </Field>
          </div>
        }
      />
      <ConfirmDialog
        open={dialog === 'VERIFIED'}
        onClose={() => setDialog(null)}
        title={`Mark ${n} entr${n === 1 ? 'y' : 'ies'} verified?`}
        description="Record that you have checked these entries and they are in order. Your name and the time are shown against each one."
        confirmLabel="Mark verified"
        reason={{ label: 'Note (optional)', required: false }}
        onConfirm={(note) => applyReview('VERIFIED', note)}
      />
      <ConfirmDialog
        open={dialog === 'FLAGGED'}
        onClose={() => setDialog(null)}
        title={`Flag ${n} entr${n === 1 ? 'y' : 'ies'}?`}
        description="A flagged entry stays flagged until it is verified. The Head of Treasury and the MD are told."
        confirmLabel="Flag"
        tone="danger"
        reason={{ label: 'What needs explaining', required: true }}
        onConfirm={(note) => applyReview('FLAGGED', note)}
      />
      <ConfirmDialog
        open={dialog === 'NOT_REVIEWED'}
        onClose={() => setDialog(null)}
        title={`Put ${n} entr${n === 1 ? 'y' : 'ies'} back to not reviewed?`}
        description="Use this to undo a review made in error. The earlier review stays in the entry’s history."
        confirmLabel="Mark not reviewed"
        reason={{ label: 'Reason', required: true }}
        onConfirm={(note) => applyReview('NOT_REVIEWED', note)}
      />
    </>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={null}>
      <AuditTrail />
    </Suspense>
  );
}
