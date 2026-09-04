import SalesLeadsInbox from '@/components/SalesLeadsInbox';
import { requireAuth } from '@/lib/guards/requireAuth';
import {
  Outlet,
  createFileRoute,
  useRouterState,
} from '@tanstack/react-router';

/** Sales route: all leads inbox (backend-powered). */
export const Route = createFileRoute('/dashboard/sales/leads')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_SALES_LEADS',
  }),
  component: SalesLeadsRoute,
});

function SalesLeadsRoute() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  // leads.$leadId is nested under this route; render Outlet for detail paths.
  if (pathname !== '/dashboard/sales/leads') {
    return <Outlet />;
  }

  return <SalesLeadsInbox scope="all" />;
}
