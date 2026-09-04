import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  createFileRoute,
  Link,
  useSearch,
} from '@tanstack/react-router';

interface ConfirmationSearch {
  appointmentId?: string;
}

export const Route = createFileRoute('/appointments/confirmation')({
  validateSearch: (
    search: Record<string, unknown>
  ): ConfirmationSearch => ({
    appointmentId:
      typeof search.appointmentId === 'string'
        ? search.appointmentId
        : undefined,
  }),
  component: AppointmentConfirmationPage,
});

function AppointmentConfirmationPage() {
  const { appointmentId } = useSearch({
    from: '/appointments/confirmation',
  });

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-10 pb-8 space-y-6">
          {/* Checkmark icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Appointment Requested
            </h1>
            <p className="text-muted-foreground">
              Your appointment has been submitted successfully. A
              doctor will shortly review and confirm your request.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {appointmentId && (
              <Link
                to="/appointments/$appointmentId"
                params={{ appointmentId }}
              >
                <Button
                  variant="default"
                  className="w-full"
                  size="lg"
                >
                  Manage Appointment
                </Button>
              </Link>
            )}
            <Link to="/appointments/book">
              <Button
                variant={appointmentId ? 'outline' : 'default'}
                className="w-full"
                size="lg"
              >
                Book Another Appointment
              </Button>
            </Link>
            <Link to="/appointments/my">
              <Button variant="outline" className="w-full" size="lg">
                My Appointments
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline" className="w-full" size="lg">
                Go Back to Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
