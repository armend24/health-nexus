import { api } from '@/lib/api-client';

export const RECOMMENDATION_CATEGORIES = [
  'FOLLOW_UP',
  'CARE_PLAN',
  'LAB_TEST',
  'THERAPY',
  'WELLNESS',
  'SUPPLEMENT',
] as const;

export type RecommendationCategory =
  (typeof RECOMMENDATION_CATEGORIES)[number];

export interface CreateDoctorRecommendationRequest {
  appointment_id: number;
  category: RecommendationCategory;
  recommendation_type: string;
  approved?: boolean;
}

export interface Recommendation {
  id: number;
  appointment_id: number;
  doctor_id: number;
  client_id: number;
  category: string;
  recommendation_type: string;
  approved: boolean;
  created_at: string;
}

export const recommendationsService = {
  create: (payload: CreateDoctorRecommendationRequest) =>
    api.post<Recommendation>('/recommendations', payload),
};
