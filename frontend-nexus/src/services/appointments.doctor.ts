import { apiFetch } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';

export interface DoctorAppointment {
  id: number;
  appointment_datetime: string;
  description: string | null;
  doctor_user_id: number;
  patient_user_id: number;
  patient_name: string;
  tenant_id: number;
  status: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
}

export function useDoctorAppointments() {
  return useQuery<DoctorAppointment[]>({
    queryKey: ['doctor-appointments'],
    queryFn: () =>
      apiFetch<DoctorAppointment[]>('/appointments/doctor/me'),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
