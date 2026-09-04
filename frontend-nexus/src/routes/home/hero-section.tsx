import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import {
  ChecklistItem,
  MetricPanel,
  MiniPanel,
  StatCard,
} from './shared';

export function HeroSection({
  stats,
  benefits,
}: {
  stats: Array<{
    value: string;
    label: string;
    color: string;
  }>;
  benefits: string[];
}) {
  return (
    <section className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
      <div className="space-y-8">
        <Badge className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground shadow-sm">
          <Sparkles className="mr-2 h-4 w-4" />
          Healthcare growth, booking, and follow-up in one platform
        </Badge>

        <div className="space-y-5">
          <h1 className="max-w-4xl font-['Montserrat'] text-5xl font-semibold tracking-[-0.05em] text-balance lg:text-6xl">
            Health Nexus helps healthcare organizations attract,
            convert, and guide patients through one connected digital
            journey.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Launch branded healthcare experiences, present services
            and plans clearly, simplify booking, and keep the patient
            journey moving from first visit to next-step care.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/register">
            <Button
              size="lg"
              className="min-w-[180px] shadow-md transition-all hover:shadow-lg"
            >
              Join the Platform
            </Button>
          </Link>
          <Link to="/appointments/book" preload={false}>
            <Button
              size="lg"
              className="min-w-[180px] shadow-md transition-all hover:shadow-lg bg-primary text-primary-foreground border-2 border-primary/70 ring-2 ring-primary/10 hover:bg-primary/90 hover:ring-primary/20 focus:ring-4 focus:ring-primary/30"
              style={{
                boxShadow: '0 4px 24px 0 rgba(80, 72, 229, 0.10)',
              }}
            >
              Book Appointment
            </Button>
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              value={stat.value}
              label={stat.label}
              color={stat.color}
            />
          ))}
        </div>
      </div>

      <Card className="overflow-hidden rounded-[2rem] border-border/70 bg-card/85 shadow-[0_28px_100px_rgba(2,6,23,0.10)] dark:shadow-[0_28px_100px_rgba(0,0,0,0.40)]">
        <CardContent className="p-4 sm:p-6">
          <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Why teams choose it
                </p>
                <p className="mt-1 text-xl font-semibold">
                  Patient-ready digital experience
                </p>
              </div>
              <Badge className="rounded-full bg-emerald-500/12 px-3 py-1 text-emerald-700 dark:text-emerald-300">
                Multi-organization ready
              </Badge>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <MetricPanel
                title="Brand control"
                value="Logo, visuals, fonts, colors, messaging"
                description="Each organization can launch a tenant page that feels like its own front door."
              />
              <MetricPanel
                title="Commercial journey"
                value="Services, plans, products, booking"
                description="Patients can discover what you offer and move directly into the next step."
              />
            </div>

            <div className="mt-4 rounded-3xl border border-border/70 bg-card p-4">
              <p className="text-sm text-muted-foreground">
                Core value
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {benefits.map((item) => (
                  <ChecklistItem key={item} text={item} />
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniPanel
                label="Faster launch"
                value="1 platform"
                hint="For multi-brand healthcare operations"
              />
              <MiniPanel
                label="Patient journey"
                value="End-to-end"
                hint="From discovery to booking and follow-up"
              />
              <MiniPanel
                label="Brand flexibility"
                value="Custom"
                hint="Per tenant messaging, catalog, and experience"
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-border/70">
              <div className="relative h-52">
                <img
                  src="https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=1400&q=80"
                  alt="Healthcare team dashboard"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent dark:from-background/90" />
                <div className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs text-white backdrop-blur">
                  A cleaner path from first visit to booked care
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
