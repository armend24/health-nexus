import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

export interface DisplayTenant {
  id: number;
  slug: string | null;
  name: string;
  image: string;
  logo: string | null;
  accent: string;
}

export function TenantShowcaseSection({
  tenants,
}: {
  tenants: DisplayTenant[];
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">
          Built for organizations that want one platform without
          one-size-fits-all branding
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tenants.map((tenant) => {
          const card = (
            <>
              <div className="relative h-40">
                <img
                  src={tenant.image}
                  alt={tenant.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${tenant.accent} via-transparent to-transparent`}
                />

                <div className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/85 p-2 shadow-lg backdrop-blur">
                  <img
                    src={tenant.logo ?? '/images/logo.webp'}
                    alt={`${tenant.name} logo`}
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm font-medium">{tenant.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Branded experience, tailored catalog, and clear
                  patient journey.
                </p>
              </div>
            </>
          );

          return tenant.slug ? (
            <Link
              key={`${tenant.id}-${tenant.name}`}
              to="/landing/$tenantSlug"
              params={{ tenantSlug: tenant.slug }}
              className="group overflow-hidden rounded-[1.6rem] border border-border/70 bg-card/70 shadow-sm transition-transform hover:-translate-y-1"
            >
              {card}
            </Link>
          ) : (
            <Link
              key={`${tenant.id}-${tenant.name}`}
              to="/tenants"
              className="group overflow-hidden rounded-[1.6rem] border border-border/70 bg-card/70 shadow-sm transition-transform hover:-translate-y-1"
            >
              {card}
            </Link>
          );
        })}
      </div>
      <div className="flex justify-center w-full">
        <Link to="/tenants">
          <Button
            variant="default"
            className="rounded-full bg-card/80 px-5"
          >
            I want to see all <ArrowRight className=" h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
}
