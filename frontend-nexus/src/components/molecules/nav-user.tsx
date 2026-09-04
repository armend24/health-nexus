import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
  IconNotification,
  IconUserCircle,
} from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';

import { DashboardProfilePanel } from '@/components/molecules/dashboard-profile-panel';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useUnreadCount } from '@/services/notifications.queries';
import { useAuthStore } from '@/stores/auth.store';
import { useDialogStore } from '@/stores/use-dialog-store';
import { SubscriptionPlansModal } from './subscription-plans-modal';

export type NavUserInfo = {
  name: string;
  email: string;
  avatar?: string;
};

export function NavUser({
  user,
}: {
  user: NavUserInfo | null | undefined;
}) {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const dialog = useDialogStore();
  const { data: unreadCount = 0 } = useUnreadCount();

  const handleLogout = async () => {
    await logout();
    navigate({
      to: '/login',
      search: {
        reason: undefined,
        redirect: undefined,
      },
      replace: true,
    });
  };

  const handleOpenPlans = () => {
    dialog.open({
      content: (
        <SubscriptionPlansModal onClose={() => dialog.close()} />
      ),
      showCloseButton: true,
    });
  };

  const handleOpenProfile = () => {
    dialog.open({
      title: 'My Profile',
      content: <DashboardProfilePanel />,
    });
  };

  const display = user
    ? {
        name: user.name,
        email: user.email,
        avatar: user.avatar ?? '',
      }
    : { name: 'Loading…', email: '', avatar: '' };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage
                  src={display.avatar}
                  alt={display.name}
                />
                <AvatarFallback className="rounded-lg">
                  {display.name.slice(0, 2).toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {display.name}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {display.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={display.avatar}
                    alt={display.name}
                  />
                  <AvatarFallback className="rounded-lg">
                    {display.name.slice(0, 2).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {display.name}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {display.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={handleOpenProfile}>
                <IconUserCircle />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenPlans}>
                <IconCreditCard />
                Health Nexus Plans
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconNotification />
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
