import type { AppUser, ListQuery, ListResult, Notification } from '@/domain/types';
import type { Db } from '@/data/db';
import { getDb, mutate } from '@/data/store';
import { writeAudit } from '@/data/audit';
import { AppError, getById, paginate } from '@/data/repo';
import { USE_MOCK, ctx, http, requireUser, run, sessionUser } from './core';

export interface NotificationRow extends Notification {
  read: boolean;
}

export interface NotificationsService {
  list(q?: ListQuery<{ unreadOnly?: boolean }>): Promise<ListResult<NotificationRow>>;
  /** Synchronous unread count for the bell (local store). */
  unreadCount(): number;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<number>;
  clear(id: string): Promise<void>;
  clearAll(): Promise<number>;
}

function mine(db: Db, u: AppUser): Notification[] {
  return db.notifications.filter(
    (n) =>
      (n.targetUserId === u.id || (n.targetRole && n.targetRole === u.roleCode)) &&
      !n.clearedBy.includes(u.id)
  );
}

export const mockNotificationsService: NotificationsService = {
  list: (q = {}) =>
    run(() => {
      const u = requireUser();
      const rows = mine(getDb(), u)
        .map((n) => ({ ...n, read: n.readBy.includes(u.id) }))
        .filter((n) => !q.filters?.unreadOnly || !n.read);
      return paginate(rows, { sort: { field: 'createdAt', dir: 'desc' }, ...q });
    }),
  unreadCount: () => {
    const u = sessionUser();
    if (!u) return 0;
    return mine(getDb(), u).filter((n) => !n.readBy.includes(u.id)).length;
  },
  markRead: (id) =>
    run(() => {
      const c = ctx();
      mutate((db) => {
        const n = getById(db, 'notifications', id, 'notification');
        if (!n.readBy.includes(c.userId)) {
          n.readBy.push(c.userId);
          n.version += 1;
          writeAudit(db, c, {
            entity: 'Notification',
            entityId: id,
            action: 'READ',
            summary: `Notification read: ${n.title}`,
          });
        }
      });
    }),
  markAllRead: () =>
    run(() => {
      const c = ctx();
      const u = requireUser();
      return mutate((db) => {
        const unread = mine(db, u).filter((n) => !n.readBy.includes(u.id));
        for (const n of unread) {
          n.readBy.push(u.id);
          n.version += 1;
        }
        if (unread.length)
          writeAudit(db, c, {
            entity: 'Notification',
            entityId: u.id,
            action: 'READ_ALL',
            summary: `${unread.length} notifications marked read`,
          });
        return unread.length;
      });
    }),
  clear: (id) =>
    run(() => {
      const c = ctx();
      mutate((db) => {
        const n = getById(db, 'notifications', id, 'notification');
        if (n.targetUserId !== c.userId && n.targetRole !== requireUser().roleCode)
          throw new AppError('Not your notification.', 'FORBIDDEN');
        if (!n.clearedBy.includes(c.userId)) {
          n.clearedBy.push(c.userId);
          if (!n.readBy.includes(c.userId)) n.readBy.push(c.userId);
          n.version += 1;
          writeAudit(db, c, {
            entity: 'Notification',
            entityId: id,
            action: 'CLEAR',
            summary: `Notification cleared: ${n.title}`,
          });
        }
      });
    }),
  clearAll: () =>
    run(() => {
      const c = ctx();
      const u = requireUser();
      return mutate((db) => {
        const list = mine(db, u);
        for (const n of list) {
          n.clearedBy.push(u.id);
          if (!n.readBy.includes(u.id)) n.readBy.push(u.id);
          n.version += 1;
        }
        if (list.length)
          writeAudit(db, c, {
            entity: 'Notification',
            entityId: u.id,
            action: 'CLEAR_ALL',
            summary: `${list.length} notifications cleared`,
          });
        return list.length;
      });
    }),
};

export const httpNotificationsService: NotificationsService = {
  list: (q) => http.get('/notifications', q as Record<string, unknown>),
  unreadCount: () => 0,
  markRead: (id) => http.post(`/notifications/${id}/read`),
  markAllRead: () => http.post('/notifications/read-all'),
  clear: (id) => http.del(`/notifications/${id}`),
  clearAll: () => http.del('/notifications'),
};

export const notificationsService: NotificationsService = USE_MOCK
  ? mockNotificationsService
  : httpNotificationsService;
