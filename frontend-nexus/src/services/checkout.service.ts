import { apiFetch } from '@/lib/api-client';

export interface CheckoutInitiateRequest {
  enrollment_id?: number;
  tenant_subscription_id?: number;
  order_id?: number;
}

export interface CheckoutInitiateResponse {
  payment_id: number;
  status: string;
  stripe_payment_intent_id: string;
  stripe_client_secret: string;
  amount: number;
  tenant_id: number;
}

export interface CheckoutPaymentStatusResponse {
  payment_id: number;
  status: string;
  stripe_payment_intent_id: string | null;
}

export const checkoutService = {
  initiate: (body: CheckoutInitiateRequest, idempotencyKey: string) =>
    apiFetch<CheckoutInitiateResponse>('/api/checkout/initiate', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    }),
  syncStatus: (paymentId: number) =>
    apiFetch<CheckoutPaymentStatusResponse>(
      `/api/checkout/payments/${paymentId}/sync`,
      {
        method: 'POST',
      }
    ),
};
