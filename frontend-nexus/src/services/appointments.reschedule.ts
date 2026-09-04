import { apiFetch } from '@/lib/api-client';
import { updateAppointmentDatetime } from '@/services/appointments.store';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface ReschedulePayload {
  tenant_id: number;
  doctor_id: number;
  department_id: number;
  appointment_datetime: string; // naive ISO e.g. "2026-03-10T09:00:00"
  duration_minutes?: number;
  description?: string;
}

export function useRescheduleAppointment(appointmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ReschedulePayload) => {
      return apiFetch<{
        id: number;
        status: string;
      }>(`/appointments/${appointmentId}/reschedule`, {
        method: 'PATCH',
        body: {
          tenant_id: payload.tenant_id,
          doctor_id: payload.doctor_id,
          department_id: payload.department_id,
          appointment_datetime: payload.appointment_datetime,
          duration_minutes: payload.duration_minutes ?? 30,
          description: payload.description ?? null,
        },
      });
    },
    onSuccess: (_result, variables) => {
      updateAppointmentDatetime(
        appointmentId,
        variables.appointment_datetime
      );
      queryClient.invalidateQueries({
        queryKey: ['appointment-status-history', appointmentId],
      });
    },
  });
}
