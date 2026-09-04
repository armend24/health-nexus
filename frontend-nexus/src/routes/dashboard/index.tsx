import { ChartAreaInteractive } from '@/components/molecules/chart-area-interactive';
import { DataTable, schema } from '@/components/molecules/data-table';
import { FeatureUnavailableCard } from '@/components/molecules/feature-unavailable-card';
import { SectionCards } from '@/components/molecules/section-cards';
import SalesLeadsInbox from '@/components/SalesLeadsInbox';

import { TenantFeatureGuard } from '@/components/TenantFeatureGuard';
import dashboardData from '@/lib/dashboard-data.json';
import { requireAuth } from '@/lib/guards/requireAuth';
import { useAuthStore } from '@/stores/auth.store';
import { IconSparkles } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

/**
 * Role-based dashboard landing:
 * - SALES: open Sales lead inbox directly for faster daily workflow.
 * - Others: keep existing dashboard analytics widgets.
 */
export const Route = createFileRoute('/dashboard/')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_HOME',
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const role = useAuthStore((s) => s.role);
  const data = z.array(schema).parse(dashboardData);

  if (role === 'SALES') {
    return <SalesLeadsInbox />;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6 ">
      <TenantFeatureGuard
        featureKey="ai_insights"
        fallback={
          <FeatureUnavailableCard
            title="AI Insights"
            description="AI Insights is not available on your current plan."
            featureLabel="ai_insights"
            icon={IconSparkles}
            showCurrentPlan
          />
        }
      >
        <SectionCards />
        <ChartAreaInteractive />
        <DataTable data={data} />
      </TenantFeatureGuard>
    </div>
  );
}
