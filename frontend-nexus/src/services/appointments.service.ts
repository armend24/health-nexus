import { apiFetch } from '@/lib/api-client';

export interface DoctorAvailabilitySlot {
  time: string; // e.g. '09:00', '09:30'
  available: boolean;
}

export interface DoctorAvailabilityResponse {
  slots: DoctorAvailabilitySlot[];
}

export interface TenantDoctor {
  id: string;
  name: string;
  specialization: string | null;
  department_id: string;
}

export async function getTenantDoctors(): Promise<TenantDoctor[]> {
  return apiFetch<TenantDoctor[]>('/appointments/tenant-doctors', {
    method: 'GET',
  });
}

export async function getDoctorAvailability(
  doctorId: string,
  date: string
): Promise<DoctorAvailabilityResponse> {
  // Backend returns array of ISO datetimes
  const datetimes = await apiFetch<string[]>(
    `/appointments/doctor/${doctorId}/availability?date=${date}`,
    { method: 'GET' }
  );

  // Transform to slot format — parse time directly from ISO string
  // Backend returns naive datetimes like "2026-03-10T09:00:00" (no Z),
  // so we extract HH:MM from the string to avoid timezone conversion.
  const slots = datetimes.map((dt) => {
    const timePart = dt.split('T')[1] ?? '00:00:00';
    const [hours, minutes] = timePart.split(':');
    return {
      time: `${hours}:${minutes}`,
      available: true,
    };
  });

  // Sort by time
  slots.sort((a, b) => a.time.localeCompare(b.time));

  return { slots };
}
