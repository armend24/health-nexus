import SalesLeadsInbox from '@/components/SalesLeadsInbox';
import { requireAuth } from '@/lib/guards/requireAuth';
import { createFileRoute } from '@tanstack/react-router';

/** Sales route: leads currently assigned to logged-in sales user. */
export const Route = createFileRoute('/dashboard/sales/my-leads')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_SALES_MY_LEADS',
  }),
  component: SalesMyLeadsRoute,
});

function SalesMyLeadsRoute() {
  return <SalesLeadsInbox scope="mine" />;
}
