import { requireAuth } from '@/lib/guards/requireAuth';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/tenant')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_TENANT',
  }),
  loader: ({ location }) => {
    // Redirect only for the bare parent URL, not for child section routes.
    if (location.pathname === '/dashboard/tenant') {
      throw redirect({
        to: '/dashboard/tenant/$section',
        params: {
          section: 'departments-services',
        },
      });
    }
  },
});
