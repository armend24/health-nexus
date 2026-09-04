import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  getMyNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications.service';

const NOTIFICATIONS_KEY = ['notifications'] as const;
const UNREAD_COUNT_KEY = ['notifications', 'unread-count'] as const;

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, { unreadOnly }],
    queryFn: () => getMyNotifications(unreadOnly),
    staleTime: 10_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: getUnreadCount,
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function invalidateNotifications(
  qc: ReturnType<typeof useQueryClient>
) {
  qc.invalidateQueries({
    queryKey: NOTIFICATIONS_KEY,
  });
  qc.invalidateQueries({
    queryKey: UNREAD_COUNT_KEY,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: number) =>
      markNotificationRead(notificationId),
    onSuccess: () => {
      invalidateNotifications(qc);
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      invalidateNotifications(qc);
    },
  });
}
