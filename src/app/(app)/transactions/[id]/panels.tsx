'use client';

import { useState } from 'react';
import { Pencil, Send, Trash2 } from 'lucide-react';
import { APPROVAL_LEVELS } from '@/domain/codes';
import { formatDateTime } from '@/lib/format';
import { transactionsService } from '@/services';
import type { NamedAudit, NamedComment, TxnDetail } from '@/services/transactionsService';
import {
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  Dot,
  EmptyState,
  IconButton,
  Textarea,
  toast,
  toastError,
} from '@/components/ui';

interface Event {
  at: string;
  title: string;
  by: string;
  note?: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  cycle?: number;
}

/** Chronological history: instruction, signatures (all cycles), execution attempts, completion. */
export function Timeline({ d }: { d: TxnDetail }) {
  const t = d.txn;
  const ev: Event[] = [
    { at: t.createdAt, title: 'Draft created', by: d.maker.fullName, tone: 'neutral' },
  ];
  if (t.receivedAt)
    ev.push({
      at: t.receivedAt,
      title: 'Instruction received',
      by: d.customer.customerName,
      tone: 'info',
      note: 'SLA clock started',
    });
  for (const c of d.callbacks)
    ev.push({
      at: c.createdAt,
      title: `Call-back ${c.outcome.toLowerCase()}`,
      by: c.officerName,
      tone: c.outcome === 'CONFIRMED' ? 'success' : 'warning',
      note: c.notes || undefined,
    });
  for (const a of d.approvals) {
    const lvl = APPROVAL_LEVELS[a.levelNo - 1];
    ev.push({
      at: a.actedAt,
      title:
        a.action === 'APPROVE'
          ? a.levelNo === 1
            ? 'Signed and submitted'
            : `Approved – ${lvl.label}`
          : a.action === 'RETURN'
            ? `Returned – ${lvl.label}`
            : `Rejected – ${lvl.label}`,
      by: a.userName,
      tone: a.action === 'APPROVE' ? 'success' : a.action === 'RETURN' ? 'warning' : 'danger',
      note: a.comments || undefined,
      cycle: a.cycleNo,
    });
  }
  for (const e of d.executions) {
    ev.push({
      at: e.executedAt,
      title: e.status === 'SUCCESS' ? 'Executed by Operations' : 'GAPS submission failed',
      by: e.executedByName,
      tone: e.status === 'SUCCESS' ? 'success' : 'danger',
      note: [e.cbsPostingRef, e.gapsRef, e.failureReason].filter(Boolean).join(' · '),
    });
  }
  if (t.completedAt)
    ev.push({
      at: t.completedAt,
      title: 'Completion confirmed',
      by: d.maker.fullName,
      tone: 'success',
      note: d.sla?.label,
    });
  if (t.status === 'STOPPED')
    ev.push({
      at: t.updatedAt,
      title: 'Stopped – signature mismatch',
      by: d.maker.fullName,
      tone: 'danger',
      note: t.stopReason ?? undefined,
    });
  if (t.status === 'CANCELLED')
    ev.push({
      at: t.updatedAt,
      title: 'Cancelled',
      by: d.maker.fullName,
      tone: 'neutral',
      note: t.rejectReason ?? undefined,
    });
  ev.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Card>
      <CardBody>
        <ol className="relative space-y-4 border-l border-border pl-5">
          {ev.map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative">
              <span className="absolute -left-[25px] top-1.5">
                <Dot tone={e.tone === 'info' ? 'info' : e.tone} />
              </span>
              <p className="text-sm font-medium">
                {e.title}
                {e.cycle && e.cycle > 1 ? <Badge className="ml-2">Cycle {e.cycle}</Badge> : null}
              </p>
              <p className="num text-xs text-muted">
                {e.by} · {formatDateTime(e.at)}
              </p>
              {e.note ? <p className="mt-0.5 text-[13px] text-muted">{e.note}</p> : null}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

function CommentItem({ c }: { c: NamedComment }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(c.body);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px]">
          <span className="font-medium">{c.userName}</span>{' '}
          <span className="num text-xs text-muted">
            {formatDateTime(c.createdAt)}
            {c.editedAt ? ' · edited' : ''}
          </span>
        </p>
        {c.mine && !editing ? (
          <span className="flex shrink-0">
            <IconButton icon={Pencil} label="Edit comment" onClick={() => setEditing(true)} />
            <IconButton icon={Trash2} label="Delete comment" onClick={() => setDel(true)} />
          </span>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Edit comment"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={() => {
                setBody(c.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              disabled={!body.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await transactionsService.editComment(c.id, body, c.version);
                  toast.success('Comment updated');
                  setEditing(false);
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
      )}
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title="Delete comment?"
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          await transactionsService.deleteComment(c.id, c.version);
          toast.success('Comment deleted');
        }}
      />
    </li>
  );
}

export function CommentsPanel({ d }: { d: TxnDetail }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      await transactionsService.addComment(d.txn.id, body);
      setBody('');
      toast.success('Comment added');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardBody>
        {d.comments.length ? (
          <ul className="divide-y divide-border">
            {d.comments.map((c) => (
              <CommentItem key={c.id} c={c} />
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No comments yet"
            description="Notes added here are visible to every role."
          />
        )}
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Textarea
            rows={2}
            placeholder="Add a comment"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="New comment"
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              icon={Send}
              loading={busy}
              disabled={!body.trim()}
              onClick={add}
            >
              Add comment
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function AuditList({ events }: { events: NamedAudit[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!events.length) return <EmptyState title="No audit events" />;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {events.map((e) => (
          <li key={e.id} className="px-4 py-2.5">
            <button
              type="button"
              className="flex w-full flex-wrap items-start justify-between gap-2 text-left"
              onClick={() => setOpen(open === e.id ? null : e.id)}
              aria-expanded={open === e.id}
            >
              <span className="min-w-0">
                <span className="block text-sm">{e.summary}</span>
                <span className="num block text-xs text-muted">
                  #{e.seqNo} · {e.userName} ({e.roleCode}) · {formatDateTime(e.ts)} · {e.ipAddr}
                </span>
              </span>
              <Badge>{e.action}</Badge>
            </button>
            {open === e.id && (e.before || e.after) ? (
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <pre className="overflow-x-auto rounded bg-surface-2 p-2">
                  {JSON.stringify(e.before ?? {}, null, 2)}
                </pre>
                <pre className="overflow-x-auto rounded bg-surface-2 p-2">
                  {JSON.stringify(e.after ?? {}, null, 2)}
                </pre>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
