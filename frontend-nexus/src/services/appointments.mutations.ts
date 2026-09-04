import { apiFetch } from '@/lib/api-client';
import { saveAppointment } from '@/services/appointments.store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface BookAppointmentRequest {
  tenant_id: string;
  doctor_id: string;
  department_id?: string;
  appointment_datetime: string; // ISO datetime
  duration_minutes?: number;
  description?: string;
}

export interface BookAppointmentResponse {
  id: string;
  status: string;
}

export function useBookAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: BookAppointmentRequest) => {
      const result = await apiFetch<BookAppointmentResponse>(
        '/appointments/book',
        {
          method: 'POST',
          body: {
            tenant_id: parseInt(data.tenant_id),
            doctor_id: parseInt(data.doctor_id),
            department_id: data.department_id
              ? parseInt(data.department_id)
              : 1,
            appointment_datetime: data.appointment_datetime,
            duration_minutes: data.duration_minutes || 30,
            description: data.description,
          },
        }
      );
      // Save to localStorage so patient can see it in My Appointments
      saveAppointment({
        id: String(result.id),
        appointment_datetime: data.appointment_datetime,
        status: (result.status as 'REQUESTED') || 'REQUESTED',
        doctor_id: data.doctor_id,
        tenant_id: data.tenant_id,
        bookedAt: new Date().toISOString(),
      });
      return result;
    },
    onSuccess: (result) => {
      toast.success('Appointment booked successfully!');
      queryClient.invalidateQueries({
        queryKey: ['doctor-availability'],
      });
      queryClient.invalidateQueries({
        queryKey: ['patient-appointments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['doctor-appointments'],
      });
      window.location.assign(
        `/appointments/confirmation?appointmentId=${result.id}`
      );
    },
    onError: (error: any) => {
      const message =
        error?.detail ||
        error?.message ||
        'Failed to book appointment';
      toast.error(message);
    },
  });
}
