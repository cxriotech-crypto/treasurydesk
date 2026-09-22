'use client';

import Link from 'next/link';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { notificationsService } from '@/services';
import { useData, useStoreRevision } from '@/services/useData';
import { isReady } from '@/app/routes';
import { formatDateTime } from '@/lib/format';
import { Button, IconButton, Popover, SkeletonRows, cn, toastError } from '@/components/ui';
import type { NotificationRow } from '@/services/notificationsService';

function Item({ n, onDone }: { n: NotificationRow; onDone: () => void }) {
  const markRead = () => {
    if (!n.read) notificationsService.markRead(n.id).catch(toastError);
  };
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
        <span className={cn('block text-sm', !n.read && 'font-semibold')}>{n.title}</span>
        <span className="block text-[13px] text-muted">{n.body}</span>
        <span className="num mt-0.5 block text-xs text-subtle">{formatDateTime(n.createdAt)}</span>
      </span>
    </>
  );
  const cls = 'flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-surface-2';
  return (
    <li>
      {isReady(n.link) ? (
        <Link
          href={n.link}
          className={cls}
          onClick={() => {
            markRead();
            onDone();
          }}
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          className={cls}
          onClick={markRead}
          aria-label={`${n.title}${n.read ? '' : ' (mark as read)'}`}
        >
          {body}
        </button>
      )}
    </li>
  );
}

export function NotificationsBell() {
  useStoreRevision();
  const unread = notificationsService.unreadCount();
  const list = useData(() => notificationsService.list({ pageSize: 8 }), []);

  return (
    <Popover
      label="Notifications"
      panelClassName="sm:w-96"
      trigger={({ toggle, open, id }) => (
        <IconButton
          icon={Bell}
          label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          badge={unread}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
        />
      )}
    >
      {(close) => (
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">
              Notifications
              {unread ? (
                <span className="num ml-1 font-normal text-muted">({unread} unread)</span>
              ) : null}
            </p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                icon={CheckCheck}
                disabled={!unread}
                onClick={() => notificationsService.markAllRead().catch(toastError)}
              >
                Mark all read
              </Button>
              <IconButton
                icon={Trash2}
                label="Clear all notifications"
                disabled={!list.data?.total}
                onClick={() => notificationsService.clearAll().catch(toastError)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.loading ? (
              <SkeletonRows rows={4} className="p-3" />
            ) : !list.data?.items.length ? (
              <p className="px-3 py-8 text-center text-sm text-muted">You are all caught up.</p>
            ) : (
              <ul className="divide-y divide-border">
                {list.data.items.map((n) => (
                  <Item key={n.id} n={n} onDone={close} />
                ))}
              </ul>
            )}
          </div>
          {isReady('/notifications') ? (
            <Link
              href="/notifications"
              onClick={close}
              className="border-t border-border px-3 py-2.5 text-center text-sm font-medium hover:bg-surface-2"
            >
              View all notifications
            </Link>
          ) : null}
        </div>
      )}
    </Popover>
  );
}
