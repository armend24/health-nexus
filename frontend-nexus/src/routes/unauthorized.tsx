import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth.store';
import { createFileRoute, Link } from '@tanstack/react-router';

/** Dedicated 403 screen for users without required permissions. Styled consistently with login (Card, typography). */
export const Route = createFileRoute('/unauthorized')({
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      data-testid="unauthorized-page"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <p className="text-sm font-medium text-amber-600">
            403 · Unauthorized
          </p>
          <CardTitle className="text-2xl">
            You do not have access to this area
          </CardTitle>
          <CardDescription className="mx-auto max-w-md">
            Your current role does not include the permissions
            required to view this page. If you believe this is an
            error, please contact an administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => window.history.back()}
          >
            Go back
          </Button>
          {!isAuthenticated && (
            <Link
              to="/login"
              search={{
                reason: undefined,
                redirect: undefined,
              }}
            >
              <Button>Go to login</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
