import DoctorAppointmentsPage from '@/components/DoctorAppointmentsPage';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/doctor/appointments')({
  component: DoctorAppointmentsPage,
});
