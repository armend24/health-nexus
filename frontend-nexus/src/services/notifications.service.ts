import { apiFetch } from '@/lib/api-client';

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  entity_type: string | null;
  entity_id: number | null;
  created_at: string;
}

export async function getMyNotifications(
  unreadOnly = false
): Promise<Notification[]> {
  const qs = unreadOnly ? '?unread_only=true' : '';
  return apiFetch<Notification[]>(`/notifications/me${qs}`);
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiFetch<{ count: number }>(
    '/notifications/me/unread-count'
  );
  return res.count;
}

export async function markNotificationRead(
  notificationId: number
): Promise<void> {
  await apiFetch(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await apiFetch<{
    marked_read: number;
  }>('/notifications/me/read-all', {
    method: 'PATCH',
  });
  return res.marked_read;
}
