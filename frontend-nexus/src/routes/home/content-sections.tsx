import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  audience,
  faqs,
  features,
  journey,
  pricing,
  testimonials,
  trustSignals,
} from './data';
import { ChecklistItem, SectionCard } from './shared';

export function JourneySection() {
  return (
    <section className="grid gap-4 lg:grid-cols-4">
      {journey.map((item) => (
        <Card
          key={item.title}
          className={`rounded-[1.75rem] border-border/70 bg-gradient-to-br ${item.tone}`}
        >
          <CardContent className="space-y-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background/85 text-foreground shadow-sm backdrop-blur">
              <item.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {item.text}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function AudienceSection() {
  return (
    <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <Badge className="rounded-full bg-secondary px-4 py-2 text-secondary-foreground">
          Who it serves
        </Badge>
        <h2 className="font-['Montserrat'] text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Designed for healthcare organizations and the people they
          serve.
        </h2>
        <p className="max-w-xl text-lg leading-8 text-muted-foreground">
          Health Nexus supports the commercial side of care and the
          operational side of care at the same time. It helps
          organizations present services clearly while keeping the
          patient journey structured behind the scenes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {audience.map((item) => (
          <Card
            key={item}
            className="rounded-[1.5rem] border-border/70 bg-card/85 shadow-sm"
          >
            <CardContent className="p-5">
              <p className="text-lg font-semibold">{item}</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Health Nexus supports branded customer experience,
                organizational control, and guided care workflows in
                the same platform.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function FeaturesSection() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {features.map((feature) => (
        <Card
          key={feature.title}
          className={`rounded-[1.75rem] border-border/70 bg-gradient-to-br ${feature.color}`}
        >
          <CardContent className="space-y-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background/85 text-foreground shadow-sm backdrop-blur">
              <feature.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {feature.description}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function ValueSection({ benefits }: { benefits: string[] }) {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <SectionCard className="rounded-[2rem] border-border/70 bg-card/85">
        <Badge className="rounded-full bg-secondary px-4 py-2 text-secondary-foreground">
          Why Health Nexus
        </Badge>
        <h2 className="font-['Montserrat'] text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Benefits that matter to healthcare operators
        </h2>
        <div className="grid gap-3">
          {benefits.map((item) => (
            <ChecklistItem key={item} text={item} />
          ))}
        </div>
      </SectionCard>

      <SectionCard className="rounded-[2rem] border-border/70 bg-[linear-gradient(135deg,hsl(42_100%_70%/.12),transparent_55%),linear-gradient(180deg,hsl(220_60%_65%/.08),transparent_65%)] dark:bg-[linear-gradient(135deg,hsl(42_90%_55%/.10),transparent_55%),linear-gradient(180deg,hsl(220_60%_55%/.08),transparent_65%)]">
        <Badge className="rounded-full bg-background px-4 py-2 text-foreground">
          Trust and control
        </Badge>
        <h2 className="font-['Montserrat'] text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Built to scale across multiple brands and workflows
        </h2>
        <div className="grid gap-3">
          {trustSignals.map((item) => (
            <ChecklistItem key={item} text={item} />
          ))}
        </div>
      </SectionCard>
    </section>
  );
}

export function PricingSection() {
  return (
    <section className="space-y-6">
      <div className="max-w-2xl space-y-4">
        <Badge className="rounded-full bg-secondary px-4 py-2 text-secondary-foreground">
          Pricing
        </Badge>
        <h2 className="font-['Montserrat'] text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Plans that match the scale of your organization
        </h2>
        <p className="text-lg leading-8 text-muted-foreground">
          Choose a pricing tier that fits your operation today, then
          expand as your catalog, patient volume, and brand network
          grow.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {pricing.map((plan) => (
          <Card
            key={plan.tier}
            className="rounded-[2rem] border-border/70 bg-card/85"
          >
            <CardContent className="space-y-4 p-6">
              <div>
                <div>
                  <h3 className="text-2xl font-semibold">
                    {plan.tier}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {plan.summary}
                  </p>
                </div>
              </div>
              <p className="text-4xl font-semibold">
                {plan.price}
                <span className="text-base font-normal text-muted-foreground">
                  /month
                </span>
              </p>
              <div className="h-2 rounded-full bg-muted">
                <div className={`h-2 rounded-full ${plan.bar}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function ProofSection() {
  return (
    <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <SectionCard className="rounded-[2rem] border-border/70 bg-card/85">
        <Badge className="rounded-full bg-secondary px-4 py-2 text-secondary-foreground">
          Proof points
        </Badge>
        <h2 className="font-['Montserrat'] text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          What organizations gain with one connected platform
        </h2>
        <div className="grid gap-3">
          {trustSignals.map((item) => (
            <ChecklistItem key={item} text={item} />
          ))}
        </div>
      </SectionCard>

      <Card className="overflow-hidden rounded-[2rem] border-border/70 bg-card/85">
        <div className="relative h-56">
          <img
            src="https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1400&q=80"
            alt="Healthcare collaboration"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent dark:from-background/90" />
        </div>
        <CardContent className="space-y-5 p-6 sm:p-8">
          <Badge className="rounded-full bg-secondary px-4 py-2 text-secondary-foreground">
            Customer perspective
          </Badge>
          <h2 className="font-['Montserrat'] text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            A better experience for both operators and patients
          </h2>
          <div className="grid gap-3">
            {testimonials.map((item) => (
              <ChecklistItem
                key={item.author}
                text={`"${item.quote}" - ${item.author}, ${item.company}`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function FaqSection() {
  return (
    <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-4">
        <Badge className="rounded-full bg-secondary px-4 py-2 text-secondary-foreground">
          FAQ
        </Badge>
        <h2 className="font-['Montserrat'] text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Questions buyers usually ask first
        </h2>
        <p className="max-w-xl text-lg leading-8 text-muted-foreground">
          The essentials are visible up front so visitors can
          understand the model quickly and move toward registration.
        </p>
      </div>

      <div className="space-y-3">
        {faqs.map((faq) => (
          <Card
            key={faq.question}
            className="rounded-3xl border-border/70 bg-card/85"
          >
            <CardContent className="p-5">
              <h3 className="text-lg font-semibold">
                {faq.question}
              </h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {faq.answer}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
