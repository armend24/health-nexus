import {
  IconBell,
  IconBellFilled,
  IconCalendarEvent,
  IconCheck,
  IconChecks,
  IconCreditCard,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getNotificationNavigationTarget } from '@/lib/offers';
import { dispatchTenantSubscriptionUpdated } from '@/lib/tenant-subscription-events';
import {
  invalidateNotifications,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '@/services/notifications.queries';
import type { Notification } from '@/services/notifications.service';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Returns the appropriate icon for a notification type.
 * @param type Notification type string
 */
function notificationIcon(type: string) {
  switch (type) {
    case 'APPOINTMENT_CONFIRMED':
      return <IconCheck className="size-4 text-green-400" />;
    case 'APPOINTMENT_REJECTED':
    case 'APPOINTMENT_CANCELLED':
      return <IconCalendarEvent className="size-4 text-red-400" />;
    case 'APPOINTMENT_CREATED':
    case 'APPOINTMENT_RESCHEDULED':
      return <IconCalendarEvent className="size-4 text-blue-400" />;
    case 'APPOINTMENT_COMPLETED':
      return <IconChecks className="size-4 text-green-400" />;
    case 'OFFER_DELIVERED':
      return <IconBell className="size-4 text-amber-500" />;
    case 'TENANT_SUBSCRIPTION_CANCELLED':
      return <IconCreditCard className="size-4 text-amber-500" />;
    default:
      return <IconBell className="size-4" />;
  }
}

/**
 * Renders a single notification row in the dropdown menu.
 * Handles marking as read and navigation.
 */
function NotificationRow({
  notification,
  onRead,
  onNavigate,
}: {
  notification: Notification;
  onRead: (id: number) => void;
  onNavigate: (n: Notification) => void;
}) {
  return (
    <DropdownMenuItem
      className="flex items-start gap-3 p-3 cursor-pointer"
      onClick={() => {
        if (!notification.is_read) onRead(notification.id);
        onNavigate(notification);
      }}
    >
      <div className="mt-0.5 shrink-0">
        {notificationIcon(notification.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-tight ${notification.is_read ? 'text-muted-foreground' : 'font-medium text-foreground'}`}
        >
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          {notification.created_at
            ? formatDistanceToNow(new Date(notification.created_at), {
                addSuffix: true,
              })
            : ''}
        </p>
      </div>
      {!notification.is_read && (
        <span className="mt-1.5 size-2 rounded-full bg-primary shrink-0" />
      )}
    </DropdownMenuItem>
  );
}

/**
 * NotificationBell displays a bell icon with unread count and a dropdown menu of notifications.
 * Handles marking notifications as read, navigation, and invalidation on open.
 */
export function NotificationBell() {
  const qc = useQueryClient();
  const { data: count = 0 } = useUnreadCount();
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const seenNotificationIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (notifications.length === 0) {
      return;
    }

    const seenNotificationIds = seenNotificationIdsRef.current;

    if (seenNotificationIds.size === 0) {
      notifications.forEach((notification) => {
        seenNotificationIds.add(notification.id);
      });
      return;
    }

    notifications.forEach((notification) => {
      if (seenNotificationIds.has(notification.id)) {
        return;
      }

      seenNotificationIds.add(notification.id);

      if (
        !notification.is_read &&
        notification.type === 'TENANT_SUBSCRIPTION_CANCELLED'
      ) {
        toast.error(notification.title, {
          description: notification.message,
        });
        dispatchTenantSubscriptionUpdated();
      }
    });
  }, [notifications]);

  /**
   * Handles navigation for a notification, based on its entity type and id.
   */
  const handleNavigate = (n: Notification) => {
    setOpen(false);
    if (n.entity_type === 'appointment' && n.entity_id) {
      const role = useAuthStore.getState().role;
      if (role === 'DOCTOR') {
        // Doctors go to their appointment management dashboard
        navigate({
          to: '/dashboard/appointments',
        });
      } else {
        navigate({
          to: '/appointments/$appointmentId',
          params: {
            appointmentId: String(n.entity_id),
          },
        });
      }
      return;
    }

    if (n.entity_type === 'tenant_subscription') {
      dispatchTenantSubscriptionUpdated();
      navigate({ to: '/dashboard/subscriptions' } as never);
      return;
    }

    const target = getNotificationNavigationTarget(n);
    if (target) {
      navigate(target as never);
    }
  };

  // Main UI: bell icon, unread badge, dropdown menu
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) invalidateNotifications(qc);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {count > 0 ? (
            <IconBellFilled className="size-5" />
          ) : (
            <IconBell className="size-5" />
          )}
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {count > 99 ? '99+' : count}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 max-h-[28rem] overflow-y-auto"
      >
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {count > 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                markAllRead.mutate();
              }}
              className="text-xs text-primary hover:underline font-normal"
            >
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onRead={(id) => markRead.mutate(id)}
              onNavigate={handleNavigate}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
