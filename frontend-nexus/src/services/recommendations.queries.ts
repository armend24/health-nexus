import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  recommendationsService,
  type CreateDoctorRecommendationRequest,
  type Recommendation,
} from './recommendations.service';

/**
 * Mutation hook to create a doctor recommendation for an appointment.
 * Shows toast notifications for success and error.
 */
export function useCreateRecommendation() {
  return useMutation<
    Recommendation,
    Error,
    CreateDoctorRecommendationRequest
  >({
    mutationFn: (payload: CreateDoctorRecommendationRequest) =>
      recommendationsService.create(payload),
    onSuccess: () => {
      toast.success('Recommendation created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create recommendation');
    },
  });
}
