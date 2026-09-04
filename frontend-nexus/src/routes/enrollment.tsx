import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth.store';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/enrollment')({
  component: EnrollmentRequiredPage,
});

function EnrollmentRequiredPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const handleSignOut = async () => {
    await logout();
    navigate({ to: '/login' });
  };
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Enrollment Required</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>You need an active enrollment to book appointments.</p>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => navigate({ to: '/contact-admin' })}
            >
              Contact Admin
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
