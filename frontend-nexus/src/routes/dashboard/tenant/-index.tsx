import { TenantFeatureGuard } from '@/components/TenantFeatureGuard';
import { FeatureUnavailableCard } from '@/components/molecules/feature-unavailable-card';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth.store';
import { IconPalette } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS, type TenantSectionKey } from './-constants';
import { InfoPill } from './-shared';
import {
  getCurrentTenantWithFallback,
  getErrorMessage,
} from './-utils';
import { ContractsPage } from './contracts';
import { TenantDepartmentsManager } from './departments-services/-index';
import { DoctorsManager } from './doctors/-index';
import { TenantEnrollmentsPanel } from './enrollments/-index';
import { TenantPlansPanel } from './plans/-index';
import { ProductsManager } from './products/-index';
import { TenantDetailsEditor } from './settings/-index';

export {
  normalizeTenantSection,
  TENANT_SECTION_KEYS,
  type TenantSectionKey,
} from './-constants';

interface TenantManagerPageContentProps {
  activeSection: TenantSectionKey;
}

export function TenantManagerPageContent({
  activeSection,
}: TenantManagerPageContentProps) {
  const tenantIdFromStore = useAuthStore((state) => state.tenantId);

  const currentTenantQuery = useQuery({
    queryKey: QUERY_KEYS.current,
    queryFn: () => getCurrentTenantWithFallback(tenantIdFromStore),
  });

  if (currentTenantQuery.isLoading) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (currentTenantQuery.isError) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">My Tenant</h1>
        <Card>
          <CardContent className="pt-6 text-destructive">
            Failed to load tenant context:{' '}
            {getErrorMessage(currentTenantQuery.error)}
          </CardContent>
        </Card>
      </div>
    );
  }

  const tenant = currentTenantQuery.data;
  if (!tenant) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">My Tenant</h1>
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            No tenant context available.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
      <Card>
        <CardContent className="space-y-2">
          <h1 className="text-2xl font-bold sm:text-3xl">
            {tenant.name}
          </h1>
          <p className="text-muted-foreground">
            Manage branding, departments, services, products, plans,
            and enrollments.
          </p>
        </CardContent>

        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoPill label="Email" value={tenant.email} />
          <InfoPill label="Licence" value={tenant.licence_number} />
        </CardContent>
      </Card>

      <div className="space-y-6">
        {activeSection === 'departments-services' && (
          <TenantDepartmentsManager />
        )}

        {activeSection === 'doctors' && (
          <DoctorsManager tenantId={tenant.id} />
        )}

        {activeSection === 'products' && (
          <ProductsManager tenantId={tenant.id} />
        )}

        {activeSection === 'contracts' && <ContractsPage />}
        {activeSection === 'plans' && <TenantPlansPanel />}

        {activeSection === 'enrollments' && (
          <TenantEnrollmentsPanel />
        )}

        {activeSection === 'settings' && (
          <TenantFeatureGuard
            featureKey="custom_branding"
            fallback={
              <FeatureUnavailableCard
                title="Custom Branding"
                description="Custom branding settings are not available on your current plan."
                featureLabel="custom_branding"
                icon={IconPalette}
                showCurrentPlan
              />
            }
          >
            <TenantDetailsEditor />
          </TenantFeatureGuard>
        )}
      </div>
    </div>
  );
}
