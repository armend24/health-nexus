import DoctorAppointmentsPage from '@/components/DoctorAppointmentsPage';
import { requireAuth } from '@/lib/guards/requireAuth';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/appointments')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_DOCTOR_APPOINTMENTS',
  }),
  component: DoctorAppointmentsPage,
});
