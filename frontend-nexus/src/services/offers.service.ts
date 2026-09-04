import { api, apiFetch } from '@/lib/api-client';

export type OfferStatus =
  | 'PENDING'
  | 'DELIVERED'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED';

export type OfferDeliveryChannel = 'EMAIL' | 'IN_APP' | 'DASHBOARD';

export interface OfferRecommendation {
  id: number;
  appointment_id: number;
  doctor_id: number;
  client_id: number;
  category: string;
  recommendation_type: string;
  approved: boolean;
  created_at: string;
}

export interface OfferAcceptance {
  id: number;
  offer_delivery_id: number;
  accepted_at: string;
  redemption_method: string | null;
  transaction_id: string | null;
}

export interface OfferDelivery {
  id: number;
  recommendation_id: number;
  client_id: number;
  offer_status: OfferStatus;
  delivery_channel: OfferDeliveryChannel;
  sent_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  recommendation: OfferRecommendation;
  acceptance: OfferAcceptance | null;
}

export interface GenerateOffersRequest {
  appointment_id: number;
  delivery_channel?: OfferDeliveryChannel;
  expires_in_days?: number;
}

export interface GenerateOffersResponse {
  appointment_id: number;
  eligible: boolean;
  created_count: number;
  existing_count: number;
  skipped_count: number;
  offers: OfferDelivery[];
}

export interface AcceptOfferRequest {
  redemption_method?: string | null;
  transaction_id?: string | null;
}

export interface OfferViewResponse {
  id: number;
  offer_status: OfferStatus;
}

export const offersService = {
  getClientOffers: (clientId: number | string) =>
    apiFetch<OfferDelivery[]>(`/clients/${clientId}/offers`),
  generateOffers: (payload: GenerateOffersRequest) =>
    api.post<GenerateOffersResponse>('/offers/generate', payload),
  viewOffer: (offerId: number) =>
    api.post<OfferViewResponse>(`/offers/${offerId}/view`),
  acceptOffer: (offerId: number, payload: AcceptOfferRequest) =>
    api.post<OfferDelivery>(`/offers/${offerId}/accept`, payload),
  declineOffer: (offerId: number) =>
    api.post<OfferViewResponse>(`/offers/${offerId}/decline`),
};
