import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/dashboard/landing-pages/$pageId'
)({
  component: LandingPageDetail,
});

function LandingPageDetail() {
  const { pageId } = Route.useParams();

  return (
    <div>
      <Link
        to="/dashboard/landing-pages"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-primary"
      >
        ← Back to landing pages
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Landing {pageId}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Dynamic route – placeholder for Landing {pageId} content.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
