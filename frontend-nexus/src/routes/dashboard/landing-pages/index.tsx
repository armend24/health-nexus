import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { IconLayout } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/landing-pages/')({
  component: LandingPagesIndexPage,
});

const LANDINGS = [
  {
    id: '1',
    title: 'Landing 1',
    description: 'First landing page variant',
  },
  {
    id: '2',
    title: 'Landing 2',
    description: 'Second landing page variant',
  },
  {
    id: '3',
    title: 'Landing 3',
    description: 'Third landing page variant',
  },
];

function LandingPagesIndexPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Landing Pages</h1>
      <p className="mt-2 text-muted-foreground">
        Click a card to view the landing page.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LANDINGS.map((landing) => (
          <Link
            key={landing.id}
            to="/dashboard/landing-pages/$pageId"
            params={{ pageId: landing.id }}
          >
            <Card className="cursor-pointer transition-colors hover:border-primary hover:bg-muted/50">
              <CardHeader>
                <IconLayout className="mb-2 size-8 text-muted-foreground" />
                <CardTitle>{landing.title}</CardTitle>
                <CardDescription>
                  {landing.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-primary">View →</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
