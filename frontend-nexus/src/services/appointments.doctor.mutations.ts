import { apiFetch } from '@/lib/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useApproveAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      return apiFetch<{
        id: number;
        status: string;
      }>(`/appointments/${id}/approve`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['doctor-appointments'],
      });
    },
  });
}

export function useCompleteAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      return apiFetch<{
        id: number;
        status: string;
      }>(`/appointments/${id}/complete`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['doctor-appointments'],
      });
    },
  });
}

export function useRejectAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      return apiFetch<{
        id: number;
        status: string;
      }>(`/appointments/${id}/reject`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['doctor-appointments'],
      });
    },
  });
}
