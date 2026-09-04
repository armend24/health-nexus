import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { Link, useNavigate } from '@tanstack/react-router';
import { LayoutDashboard, User } from 'lucide-react';
import type { ReactNode } from 'react';

interface PublicAuthHeaderProps {
  showBrandName?: boolean;
  rightSlot?: ReactNode;
  showRightSlotWhenAuthenticated?: boolean;
  className?: string;
  containerClassName?: string;
}

export function PublicAuthHeader({
  showBrandName = true,
  rightSlot,
  showRightSlotWhenAuthenticated = false,
  className,
  containerClassName,
}: PublicAuthHeaderProps) {
  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const canGoToDashboard = role != null && role !== 'CLIENT';

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
  const handleProfile = () => {
    navigate({
      to: '/dashboard/profile',
      replace: true,
    });
  };

  const userInitial = (
    user?.email?.trim().charAt(0) ||
    user?.fullName?.trim().charAt(0) ||
    'U'
  ).toUpperCase();
  const showUserMenu = isAuthenticated && user;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl',
        className
      )}
    >
      <div
        className={cn(
          'container mx-auto flex h-14 items-center justify-between px-4 sm:px-6',
          containerClassName
        )}
      >
        <Link
          to="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-90"
        >
          <img
            src="/images/logo.webp"
            alt="Health Nexus"
            className="h-9 w-9 rounded-lg object-contain"
          />
          {showBrandName ? (
            <span className="text-lg font-semibold tracking-tight">
              Health Nexus
            </span>
          ) : null}
        </Link>

        <div className="flex items-center gap-2">
          {rightSlot &&
          (showRightSlotWhenAuthenticated || !showUserMenu)
            ? rightSlot
            : null}
          {showUserMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="icon-sm"
                  className="rounded-full text-xs font-semibold"
                  aria-label="Open account menu"
                  title={user.email}
                >
                  {userInitial}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuLabel className="text-xs sm:text-sm">
                  Signed in as
                  <br />
                  <span className="font-medium">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canGoToDashboard ? (
                  <DropdownMenuItem
                    onClick={() =>
                      navigate({
                        to: '/dashboard',
                      })
                    }
                  >
                    <LayoutDashboard
                      size={16}
                      className="text-muted-foreground"
                    />
                    Go to dashboard
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={handleProfile}>
                  <span className="flex items-center gap-2">
                    <User
                      size={16}
                      className="text-muted-foreground"
                    />
                    My Profile
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <span className="text-destructive">Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to="/login"
              search={{
                reason: undefined,
                redirect: undefined,
              }}
            >
              <Button
                size="sm"
                variant="ghost"
                className="font-medium"
              >
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
