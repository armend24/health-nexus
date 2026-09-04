import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="space-y-4">
        <p className="text-sm font-medium text-amber-600">
          404 · Page not found
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          We couldn&apos;t find that page
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground sm:text-base">
          The link may be broken or the page may have been moved. You
          can go back to the main experience and continue from there.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              }
            }}
          >
            Go back
          </Button>
          <Link to="/">
            <Button>Go to home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
