/**
 * Authenticated tenant selector: /tenants
 * Protected with APP_TENANT_SELECTOR. Lists approved tenants from GET /api/tenants.
 * Each card links to the public /landing/$tenantSlug page.
 */
import { PublicAuthHeader } from '@/components/molecules/public-auth-header';
import { TenantBrandPreview } from '@/components/molecules/tenant-brand-preview';
import { requireAuth } from '@/lib/guards/requireAuth';
import { tenantsService } from '@/services/tenants.service';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/tenants')({
  beforeLoad: requireAuth({
    routeKey: 'APP_TENANT_SELECTOR',
  }),
  component: TenantSelectorPage,
});

function TenantSelectorPage() {
  const {
    data: tenants = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['public-tenants'],
    queryFn: () => tenantsService.listPublicTenants(),
    staleTime: 60_000,
  });

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
      </div>

      <PublicAuthHeader />

      <main className="container mx-auto flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <section className="mx-auto container space-y-6">
          <p className="text-sm text-muted-foreground sm:text-base">
            Select which organization you want to use with Health
            Nexus. You can switch tenants at any time.
          </p>

          {isLoading && (
            <p className="text-muted-foreground text-sm">
              Loading tenants…
            </p>
          )}

          {isError && (
            <p className="text-destructive text-sm">
              Failed to load tenants. Try again later.
            </p>
          )}

          {!isLoading && !isError && tenants.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No tenants available.
            </p>
          )}

          {!isLoading && tenants.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {tenants.map((tenant) => {
                const slug = tenant.slug ?? String(tenant.id);
                return (
                  <Link
                    key={tenant.id}
                    to="/landing/$tenantSlug"
                    params={{ tenantSlug: slug }}
                    className="flex flex-col focus-visible:outline-none"
                  >
                    <TenantBrandPreview
                      className="h-[420px] cursor-pointer transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
                      clampAboutText
                      form={{
                        title: tenant.name,
                        moto: tenant.moto,
                        aboutText: tenant.about_text,
                        logo: tenant.logo,
                        image: tenant.image,
                      }}
                      brand={{
                        backgroundColor:
                          tenant.brand_color_background,
                        foregroundColor:
                          tenant.brand_color_foreground,
                        borderColor: tenant.brand_color_muted,
                        accentColor:
                          tenant.brand_color_secondary ??
                          tenant.brand_color_primary,
                      }}
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
