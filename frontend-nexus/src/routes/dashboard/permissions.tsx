import { createFileRoute } from '@tanstack/react-router';

import { requireAuth } from '@/lib/guards/requireAuth';
import { PermissionsFeatureFlagsPanel } from './permissions/-index';

export const Route = createFileRoute('/dashboard/permissions')({
  beforeLoad: requireAuth(),
  component: PermissionsPage,
});

function PermissionsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">
          Permissions
        </h1>
        <p className="text-muted-foreground">
          Start by managing feature flags.
        </p>
      </div>

      <PermissionsFeatureFlagsPanel />
    </div>
  );
}
