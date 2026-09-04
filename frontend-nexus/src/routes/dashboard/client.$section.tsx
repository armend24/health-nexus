import { requireAuth } from '@/lib/guards/requireAuth';
import {
  ClientPageContent,
  normalizeClientSection,
} from '@/routes/dashboard/client';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/client/$section')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_CLIENTS',
  }),
  component: ClientSectionPage,
});

function ClientSectionPage() {
  const { section } = Route.useParams();

  return (
    <ClientPageContent
      activeSection={normalizeClientSection(section)}
    />
  );
}
