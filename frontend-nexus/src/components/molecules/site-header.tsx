import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuthStore } from '@/stores/auth.store';
import { NotificationBell } from '../NotificationBell';

export function SiteHeader() {
  const { user } = useAuthStore();
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <ThemeToggle />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />

        <div className="ml-auto flex items-center gap-2">
          {user && <NotificationBell />}
        </div>
      </div>
    </header>
  );
}
