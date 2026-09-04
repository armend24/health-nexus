import { apiFetch } from '@/lib/api-client';
import { updateAppointmentStatus } from '@/services/appointments.store';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useCancelAppointment(appointmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiFetch(`/appointments/${appointmentId}/cancel`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      updateAppointmentStatus(appointmentId, 'CANCELLED');
      queryClient.invalidateQueries({
        queryKey: ['appointment-status-history', appointmentId],
      });
    },
  });
}
