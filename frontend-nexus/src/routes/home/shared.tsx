import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

export function StatCard({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-border/70 bg-gradient-to-br ${color} p-5 shadow-sm backdrop-blur`}
    >
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function MetricPanel({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-3 text-lg font-semibold">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function MiniPanel({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/70 p-3">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-3.5 w-3.5" />
      </div>
      <span className="text-sm leading-6 text-muted-foreground">
        {text}
      </span>
    </div>
  );
}

export function SectionCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-5 p-6 sm:p-8">
        {children}
      </CardContent>
    </Card>
  );
}

export function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{
    label: string;
    href: string;
  }>;
}) {
  return (
    <div className="space-y-4">
      <p className="font-medium text-foreground">{title}</p>
      <div className="flex flex-col gap-3 text-sm text-muted-foreground">
        {links.map((link) => (
          <Link
            key={`${title}-${link.label}`}
            to={link.href}
            className="transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function FooterCtaButtons() {
  return (
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
          See all tenants
        </Button>
      </Link>
    </div>
  );
}
