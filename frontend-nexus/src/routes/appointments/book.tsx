import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isApiError } from '@/lib/api-client';
import { useBookAppointment } from '@/services/appointments.mutations';
import {
  useDoctorAvailability,
  useTenantDoctors,
} from '@/services/appointments.queries';
import { checkEnrollment } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router';
import { format } from 'date-fns';
import { User } from 'lucide-react';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/appointments/book')({
  beforeLoad: async () => {
    const { ensureAuth } = useAuthStore.getState();
    await ensureAuth();

    // Re-read state after ensureAuth (it may have updated)
    const state = useAuthStore.getState();

    if (!state.user) {
      throw redirect({
        to: '/login',
        search: {
          reason: undefined,
          redirect: '/appointments/book',
        },
      });
    }

    const roleValue = state.role as unknown as string | undefined;
    const isPatient =
      state.role === 'CLIENT' || roleValue === 'PATIENT';
    if (!isPatient) {
      throw redirect({ to: '/unauthorized' });
    }

    // Check enrollment status from backend
    if (!state.tenantId) {
      throw redirect({ to: '/enrollment' });
    }
    const isEnrolled = await checkEnrollment(state.tenantId);
    if (!isEnrolled) {
      throw redirect({ to: '/enrollment' });
    }
  },
  component: AppointmentBookingPage,
});

function AppointmentBookingPage() {
  const { tenantId } = useAuthStore();
  const [doctorId, setDoctorId] = useState<string>('');
  const [date, setDate] = useState<Date | undefined>(undefined);
  const formattedDate = date ? format(date, 'yyyy-MM-dd') : '';

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const { data: doctors, isLoading: doctorsLoading } =
    useTenantDoctors();

  const handleLogout = async () => {
    await logout();
    navigate({
      to: '/login',
      search: {
        reason: undefined,
        redirect: undefined,
      },
      replace: true,
    });
  };

  const handleProfile = () => {
    navigate({
      to: '/dashboard/profile',
      replace: true,
    });
  };

  const userInitial = (
    user?.email?.trim().charAt(0) ||
    user?.fullName?.trim().charAt(0) ||
    'U'
  ).toUpperCase();

  const showUserMenu = isAuthenticated && user;

  // Auto-select the first available doctor when the list loads
  useEffect(() => {
    if (doctors && doctors.length > 0 && !doctorId) {
      setDoctorId(doctors[0].id);
    }
  }, [doctors, doctorId]);

  // Look up the full doctor object for the currently selected doctorId
  const selectedDoctor = doctors?.find((d) => d.id === doctorId);

  const {
    data: availability,
    isLoading,
    isError,
    error,
  } = useDoctorAvailability(doctorId, formattedDate);

  const bookAppointment = useBookAppointment();

  const handleSlotClick = (slotTime: string) => {
    if (!date || !tenantId) {
      return;
    }

    // Build a naive ISO datetime string matching the backend's format
    // (no timezone offset — the backend treats these as clinic-local times)
    const isoDatetime = `${formattedDate}T${slotTime}:00`;

    bookAppointment.mutate({
      tenant_id: tenantId,
      doctor_id: doctorId,
      department_id: selectedDoctor?.department_id,
      appointment_datetime: isoDatetime,
    });
  };

  const handleDateChange = (newDate: Date | undefined) => {
    setDate(newDate);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="w-full">
      {/* Page Header */}
      <div className="border-b bg-linear-to-r from-primary/5 to-transparent py-6 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Book an Appointment
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Select a date and available time slot with our
              healthcare provider
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link to="/appointments/my">
              <Button variant="outline" size="sm">
                My Appointments
              </Button>
            </Link>
            {showUserMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="icon-sm"
                    className="rounded-full text-xs font-semibold"
                    aria-label="Open account menu"
                    title={user?.email}
                  >
                    {userInitial}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuLabel className="text-xs sm:text-sm">
                    Signed in as
                    <br />
                    <span className="font-medium">{user?.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleProfile}>
                    <span className="flex items-center gap-2">
                      <User
                        size={16}
                        className="text-muted-foreground"
                      />
                      My Profile
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <span className="text-destructive">Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                to="/login"
                search={{
                  reason: undefined,
                  redirect: undefined,
                }}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="font-medium"
                >
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Doctor Selector */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">
              Select Doctor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {doctorsLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading doctors...
              </p>
            ) : doctors && doctors.length > 0 ? (
              <Select value={doctorId} onValueChange={setDoctorId}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Choose a doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.name}
                      {doc.specialization
                        ? ` — ${doc.specialization}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-destructive">
                No doctors available for your clinic.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-5">
          {/* Calendar Section */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Select Date
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={handleDateChange}
                  disabled={(d: Date) => d < today}
                />
              </CardContent>
            </Card>
          </div>

          {/* Time Slots Section */}
          <div className="md:col-span-3">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-foreground">
                  {date
                    ? `Available Slots — ${format(date, 'MMMM d, yyyy')}`
                    : 'Available Time Slots'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!date && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-3 mb-3">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Select a date to see available time slots
                    </p>
                  </div>
                )}

                {date && isLoading && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Loading slots...
                    </p>
                  </div>
                )}

                {date && isError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                    <p className="text-sm font-medium text-destructive">
                      Error Loading Slots
                    </p>
                    <p className="mt-1 text-sm text-destructive/80">
                      {isApiError(error)
                        ? error.displayMessage
                        : error?.message ||
                          'Failed to load available slots.'}
                    </p>
                  </div>
                )}

                {date &&
                  !isLoading &&
                  !isError &&
                  availability &&
                  availability.slots.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-sm text-muted-foreground">
                        No slots available for this date. Try another
                        date.
                      </p>
                    </div>
                  )}

                {date &&
                  !isLoading &&
                  !isError &&
                  availability &&
                  availability.slots.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {availability.slots.map((slot) => {
                        const appointmentDateTime = new Date(date);
                        const [hours, minutes] = slot.time
                          .split(':')
                          .map(Number);
                        appointmentDateTime.setHours(
                          hours,
                          minutes,
                          0,
                          0
                        );
                        const isPast =
                          appointmentDateTime < new Date();

                        return (
                          <Button
                            key={slot.time}
                            variant={
                              slot.available && !isPast
                                ? 'default'
                                : 'outline'
                            }
                            size="sm"
                            disabled={
                              !slot.available ||
                              isPast ||
                              bookAppointment.isPending
                            }
                            className="font-medium"
                            onClick={() => handleSlotClick(slot.time)}
                          >
                            {slot.time}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                {bookAppointment.isError && (
                  <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                    <p className="text-sm font-medium text-destructive">
                      Booking Failed
                    </p>
                    <p className="mt-1 text-sm text-destructive/80">
                      {isApiError(bookAppointment.error)
                        ? bookAppointment.error.displayMessage
                        : bookAppointment.error?.message ||
                          'Failed to book appointment'}
                    </p>
                  </div>
                )}

                {bookAppointment.isPending && (
                  <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                    <p className="text-sm text-blue-400">
                      Booking appointment...
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Info Card */}
        <Card className="mt-6 bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-sm">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="space-y-1">
                <p className="text-foreground">
                  <span className="font-medium">Duration:</span> 30
                  minutes per appointment
                </p>
                <p className="text-muted-foreground">
                  Your appointment will be confirmed once booked. You
                  will receive a confirmation notification.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
