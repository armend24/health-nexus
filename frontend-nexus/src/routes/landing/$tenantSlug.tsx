/**
 * Public tenant landing route: /landing/$tenantSlug
 * Fetches landing data from GET /api/tenants/by-slug/{slug}/landing. No auth.
 */
import { TenantLanding } from '@/components/tenant-landing';
import { isApiError } from '@/lib/api-client';
import { tenantsService } from '@/services/tenants.service';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/landing/$tenantSlug')({
  component: TenantLandingPage,
});

function TenantLandingPage() {
  const { tenantSlug } = Route.useParams();
  const {
    data: landingData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['tenant-landing', tenantSlug],
    queryFn: () => tenantsService.getLandingBySlug(tenantSlug),
    staleTime: 60_000,
  });

  if (isError && isApiError(error) && error.status === 404) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-semibold">Tenant not found</h1>
        <p className="text-muted-foreground text-sm">
          No approved tenant with slug &quot;
          {tenantSlug}&quot;.
        </p>
        <Link to="/" className="text-primary text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-semibold">
          Something went wrong
        </h1>
        <p className="text-muted-foreground text-sm">
          {isApiError(error) ? error.displayMessage : String(error)}
        </p>
        <Link to="/" className="text-primary text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <TenantLanding
      landingData={isLoading ? null : (landingData ?? null)}
    />
  );
}
