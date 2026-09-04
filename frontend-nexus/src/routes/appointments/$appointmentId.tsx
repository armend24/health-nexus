import { NotificationBell } from '@/components/NotificationBell';
import { RescheduleDialog } from '@/components/RescheduleDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCancelAppointment } from '@/services/appointments.cancel';
import { usePatientAppointments } from '@/services/appointments.patient';
import { useRescheduleAppointment } from '@/services/appointments.reschedule';
import { useAppointmentStatusHistory } from '@/services/appointments.status-history';
import {
  createFileRoute,
  Link,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { format } from 'date-fns';
import React from 'react';
import { toast } from 'sonner';

/** Strip TZ suffix so JS parses as local — keeps times consistent with booking page */
function toNaiveDate(iso: string): Date {
  return new Date(
    iso.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '')
  );
}

/** Search params optionally carry booking context from the booking flow */
interface AppointmentSearch {
  datetime?: string;
}

export const Route = createFileRoute('/appointments/$appointmentId')({
  validateSearch: (
    search: Record<string, unknown>
  ): AppointmentSearch => ({
    datetime:
      typeof search.datetime === 'string'
        ? search.datetime
        : undefined,
  }),
  component: AppointmentDetailRoute,
});

function AppointmentDetailRoute() {
  const { appointmentId } = useParams({
    strict: false,
  }) as { appointmentId: string };
  const { datetime } = useSearch({
    from: '/appointments/$appointmentId',
  });

  /* ── Status history (live-polls every 10 s) ── */
  const { data, isLoading, isError, error, refetch } =
    useAppointmentStatusHistory(appointmentId);

  /* ── Load appointment list to get context for reschedule ── */
  const { data: myAppointments } = usePatientAppointments();
  const apptContext = myAppointments?.find(
    (a) => String(a.id) === appointmentId
  );

  const cancelMutation = useCancelAppointment(appointmentId);
  const rescheduleMutation = useRescheduleAppointment(appointmentId);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false);

  /* ── Track status transitions for toasts ── */
  const prevStatusRef = React.useRef<string | null>(null);
  const history = Array.isArray(data) ? data : [];
  const latestEntry =
    history.length > 0 ? history[history.length - 1] : null;
  const currentStatus = latestEntry?.new_status ?? null;

  React.useEffect(() => {
    if (!currentStatus) return;
    if (
      prevStatusRef.current === 'REQUESTED' &&
      currentStatus === 'CONFIRMED'
    ) {
      toast.info('Your appointment has been confirmed!');
    }
    prevStatusRef.current = currentStatus;
  }, [currentStatus]);

  /* ── Loading / error states ── */
  if (isLoading)
    return <div className="p-8">Loading appointment…</div>;
  if (isError)
    return (
      <div className="p-8 text-destructive">
        {(error as Error)?.message || 'Error loading appointment'}
      </div>
    );

  const canCancel =
    currentStatus === 'REQUESTED' || currentStatus === 'CONFIRMED';
  const canReschedule =
    currentStatus === 'REQUESTED' || currentStatus === 'CONFIRMED';

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Appointment #{appointmentId}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Booked datetime (from search param) */}
          {datetime && (
            <div className="flex items-center gap-4">
              <span className="font-medium">Date &amp; Time:</span>
              <span>{format(toNaiveDate(datetime), 'PPpp')}</span>
            </div>
          )}

          {/* Current status */}
          <div className="flex items-center gap-4">
            <span className="font-medium">Status:</span>
            {currentStatus ? (
              <StatusBadge status={currentStatus} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            {/* ── Cancel ── */}
            {canCancel && (
              <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending
                      ? 'Cancelling…'
                      : 'Cancel Appointment'}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel Appointment</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to cancel this
                      appointment? This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setCancelOpen(false)}
                      disabled={cancelMutation.isPending}
                    >
                      No, go back
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={cancelMutation.isPending}
                      onClick={async () => {
                        try {
                          await cancelMutation.mutateAsync();
                          toast.success('Appointment cancelled');
                          setCancelOpen(false);
                          refetch();
                        } catch (err: any) {
                          toast.error(
                            err?.displayMessage ||
                              err?.message ||
                              'Failed to cancel'
                          );
                        }
                      }}
                    >
                      {cancelMutation.isPending
                        ? 'Cancelling…'
                        : 'Yes, cancel'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {/* ── Reschedule ── */}
            {canReschedule && (
              <>
                <RescheduleDialog
                  open={rescheduleOpen}
                  onOpenChange={setRescheduleOpen}
                  doctorId={String(apptContext?.doctor_user_id ?? '')}
                  isPending={rescheduleMutation.isPending}
                  onReschedule={async (startIso) => {
                    if (!apptContext) {
                      toast.error(
                        'Appointment context not loaded yet, please try again'
                      );
                      return;
                    }
                    // Build naive datetime (strip TZ) matching backend expectation
                    const naive = startIso
                      .replace(/Z$/, '')
                      .replace(/[+-]\d{2}:\d{2}$/, '');
                    try {
                      await rescheduleMutation.mutateAsync({
                        tenant_id: apptContext.tenant_id,
                        doctor_id: apptContext.doctor_user_id,
                        department_id: apptContext.department_id ?? 0,
                        appointment_datetime: naive,
                        duration_minutes: 30,
                      });
                      toast.success('Appointment rescheduled');
                      setRescheduleOpen(false);
                      refetch();
                    } catch (err: any) {
                      toast.error(
                        err?.displayMessage ||
                          err?.message ||
                          'Failed to reschedule'
                      );
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => setRescheduleOpen(true)}
                  disabled={rescheduleMutation.isPending}
                >
                  {rescheduleMutation.isPending
                    ? 'Rescheduling…'
                    : 'Reschedule'}
                </Button>
              </>
            )}
          </div>

          {/* Status History timeline */}
          {history.length > 0 && (
            <div className="mt-8">
              <span className="font-medium">Status History</span>
              <ul className="mt-3 space-y-3">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <StatusBadge status={entry.new_status} />
                    <span className="text-muted-foreground">
                      {format(toNaiveDate(entry.changed_at), 'PPpp')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Nav */}
          <div className="mt-6 flex items-center gap-3">
            <NotificationBell />
            <Link to="/appointments/my">
              <Button variant="outline" size="sm">
                My Appointments
              </Button>
            </Link>
            <Link to="/appointments/book">
              <Button variant="outline" size="sm">
                Book Another
              </Button>
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm">
                Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
