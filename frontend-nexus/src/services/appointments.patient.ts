import { apiFetch } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';

export interface PatientAppointment {
  id: number;
  appointment_datetime: string;
  description: string | null;
  doctor_user_id: number;
  patient_user_id: number;
  tenant_id: number;
  department_id: number | null;
  status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
}

/** Fetch the current patient's appointments from the backend (polls every 15 s). */
export function usePatientAppointments() {
  return useQuery<PatientAppointment[]>({
    queryKey: ['patient-appointments'],
    queryFn: () =>
      apiFetch<PatientAppointment[]>('/appointments/patient/me'),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
