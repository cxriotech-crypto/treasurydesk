'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCheck, Trash2 } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { notificationsService } from '@/services';
import { useData, useStoreRevision } from '@/services/useData';
import { isReady } from '@/app/routes';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Segmented,
  SkeletonRows,
  cn,
  toastError,
} from '@/components/ui';

const PAGE_SIZE = 30;

export default function NotificationsPage() {
  useStoreRevision();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [page, setPage] = useState(1);
  const q = useData(
    () =>
      notificationsService.list({
        filters: { unreadOnly: filter === 'UNREAD' },
        page,
        pageSize: PAGE_SIZE,
      }),
    [filter, page]
  );
  const unread = notificationsService.unreadCount();

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'You are all caught up.'}
        actions={
          <>
            <Button
              icon={CheckCheck}
              disabled={!unread}
              onClick={() => notificationsService.markAllRead().catch(toastError)}
            >
              Mark all read
            </Button>
            <Button
              icon={Trash2}
              variant="ghost"
              disabled={!q.data?.total}
              onClick={() => notificationsService.clearAll().catch(toastError)}
            >
              Clear all
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Segmented
          label="Filter"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'UNREAD', label: 'Unread' },
          ]}
        />
      </div>
      <Card>
        {q.error ? (
          <ErrorState error={q.error} onRetry={q.reload} />
        ) : !q.data ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : !q.data.items.length ? (
          <EmptyState
            title={filter === 'UNREAD' ? 'Nothing unread' : 'No notifications'}
            description="You are notified when something needs your attention."
          />
        ) : (
          <ul className="divide-y divide-border">
            {q.data.items.map((n) => {
              const body = (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      n.read ? 'bg-transparent' : 'bg-teal-bright'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', !n.read && 'font-semibold')}>
                      {n.title}
                    </span>
                    <span className="block text-[13px] text-muted">{n.body}</span>
                    <span className="num mt-0.5 block text-xs text-subtle">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={n.id} className="flex items-start gap-2">
                  {isReady(n.link) ? (
                    <Link
                      href={n.link}
                      className="flex flex-1 gap-2.5 px-4 py-3 hover:bg-surface-2"
                      onClick={() =>
                        !n.read && notificationsService.markRead(n.id).catch(toastError)
                      }
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="flex flex-1 gap-2.5 px-4 py-3 text-left hover:bg-surface-2"
                      onClick={() =>
                        !n.read && notificationsService.markRead(n.id).catch(toastError)
                      }
                    >
                      {body}
                    </button>
                  )}
                  <span className="py-3 pr-2">
                    <IconButton
                      icon={Trash2}
                      label={`Clear ${n.title}`}
                      onClick={() => notificationsService.clear(n.id).catch(toastError)}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {q.data && q.data.total > PAGE_SIZE ? (
        <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
          <span className="num">
            Page {page} of {Math.ceil(q.data.total / PAGE_SIZE)}
          </span>
          <span className="flex gap-2">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              disabled={page >= Math.ceil(q.data.total / PAGE_SIZE)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </span>
        </div>
      ) : null}
    </>
  );
}
