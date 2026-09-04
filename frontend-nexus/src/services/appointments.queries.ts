import { useQuery } from '@tanstack/react-query';
import {
  getDoctorAvailability,
  getTenantDoctors,
} from './appointments.service';

export function useTenantDoctors() {
  return useQuery({
    queryKey: ['tenant-doctors'],
    queryFn: getTenantDoctors,
  });
}

export function useDoctorAvailability(
  doctorId: string,
  date: string
) {
  return useQuery({
    queryKey: ['doctor-availability', doctorId, date],
    queryFn: () => getDoctorAvailability(doctorId, date),
    enabled: Boolean(doctorId && date),
  });
}
