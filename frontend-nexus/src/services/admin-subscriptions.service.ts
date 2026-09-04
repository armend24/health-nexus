import { apiFetch } from '@/lib/api-client';

const BASE = '/api/superadmin/subscriptions';

export type AdminSubscriptionStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'CANCELLED'
  | 'EXPIRED';

export interface AdminSubscriptionRequest {
  id: number;
  tenant_id: number;
  tenant_name: string;
  subscription_plan_id: number;
  subscription_plan_name: string;
  status: 'ACTIVE' | 'EXPIRED';
  admin_status: AdminSubscriptionStatus;
  activated_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  latest_payment_id: number | null;
  latest_payment_status: string | null;
  latest_payment_amount: number | null;
}

export async function listAdminSubscriptionRequests(
  status?: AdminSubscriptionStatus
): Promise<AdminSubscriptionRequest[]> {
  const searchParams = new URLSearchParams();
  if (status) {
    searchParams.set('status_filter', status);
  }

  const suffix = searchParams.toString();
  return apiFetch(`${BASE}${suffix ? `?${suffix}` : ''}`, {
    method: 'GET',
  });
}

export async function transitionAdminSubscriptionRequest(
  subscriptionId: number,
  target: Extract<AdminSubscriptionStatus, 'ACTIVE' | 'CANCELLED'>,
  reason?: string
): Promise<AdminSubscriptionRequest> {
  return apiFetch(`${BASE}/${subscriptionId}/transition`, {
    method: 'POST',
    body: {
      target,
      reason,
    },
  });
}
