import { Button } from '@/components/ui/button';
import { FooterColumn } from '@/routes/home/shared';
import { Link } from '@tanstack/react-router';

export function LandingDemoFooter() {
  return (
    <footer className="border-t border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto grid gap-10 px-6 py-12 sm:px-8 lg:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr] lg:px-10">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <img
              src="/images/logo.webp"
              alt="Health Nexus"
              className="h-11 w-11 rounded-2xl object-contain"
            />
            <div>
              <p className="font-['Montserrat'] text-xl font-semibold tracking-tight">
                Health Nexus
              </p>
              <p className="text-sm text-muted-foreground">
                One connected platform for healthcare growth,
                enrollment, and booking.
              </p>
            </div>
          </div>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Built for hospitals, clinics, and polyclinics that want a
            stronger digital front door and a clearer patient journey.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/register">
              <Button size="sm" className="rounded-full px-4">
                Register now
              </Button>
            </Link>
            <Link to="/tenants">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full bg-card/70 px-4"
              >
                See tenant page
              </Button>
            </Link>
          </div>
        </div>

        <FooterColumn
          title="Platform"
          links={[
            { label: 'Features', href: '/landing-demo' },
            { label: 'Pricing', href: '/landing-demo' },
            {
              label: 'Tenant experience',
              href: '/tenants',
            },
          ]}
        />

        <FooterColumn
          title="Journeys"
          links={[
            { label: 'Patient registration', href: '/register' },
            {
              label: 'Book appointment',
              href: '/appointments/book',
            },
            { label: 'My appointments', href: '/appointments/my' },
          ]}
        />

        <FooterColumn
          title="Access"
          links={[
            { label: 'Sign in', href: '/login' },
            { label: 'Create account', href: '/register' },
            { label: 'Dashboard', href: '/dashboard' },
          ]}
        />
      </div>

      <div className="container mx-auto flex flex-col gap-3 border-t border-border/60 px-6 py-5 text-sm text-muted-foreground sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <p>
          Health Nexus. Built for multi-organization healthcare
          operations.
        </p>
        <p>
          Branded landing pages, patient conversion, booking, and
          follow-up in one flow.
        </p>
      </div>
    </footer>
  );
}
