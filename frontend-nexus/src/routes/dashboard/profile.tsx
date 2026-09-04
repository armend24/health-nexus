import { DashboardProfilePanel } from '@/components/molecules/dashboard-profile-panel';
import { requireAuth } from '@/lib/guards/requireAuth';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/profile')({
  beforeLoad: requireAuth(),
  component: DashboardProfilePage,
});

function DashboardProfilePage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Profile
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your global account details and tenant patient
          profile details.
        </p>
      </div>
      <DashboardProfilePanel />
    </div>
  );
}
