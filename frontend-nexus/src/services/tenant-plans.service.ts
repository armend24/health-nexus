import { apiFetch } from '@/lib/api-client';

// Raw plan shape returned by the backend /user-tenant-plans endpoints.
const BASE = '/user-tenant-plans';

export interface TenantPlanApi {
  id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  price: number;
  duration?: number | null;
  max_appointments?: number | null;
  max_consultations?: number | null;
  is_active?: boolean | null;
}

export interface TenantPlanCreateApi {
  tenant_id: number;
  name: string;
  description?: string | null;
  price: number;
  duration?: number | null;
  max_appointments?: number | null;
  max_consultations?: number | null;
  is_active?: boolean | null;
}

export interface TenantPlanUpdateApi {
  name?: string;
  description?: string | null;
  price?: number;
  duration?: number | null;
  max_appointments?: number | null;
  max_consultations?: number | null;
  is_active?: boolean | null;
}

export interface PricingBoundsApi {
  min_price: number | null;
  max_price: number | null;
  base_price: number | null;
}

export interface EnrollmentDetailApi {
  id: number;
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
  patient_user_id: number;
  patient_email: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  plan_id: number;
  plan_name: string;
  activated_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  created_at: string | null;
}

export interface EnrollmentApi {
  id: number;
  tenant_id: number;
  patient_user_id: number;
  user_tenant_plan_id: number;
  created_by: number;
  status: string;
  activated_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
}

// Thin client for the user_tenant_plan FastAPI router.
export const tenantPlansService = {
  listByTenant: (tenantId: number) =>
    apiFetch<TenantPlanApi[]>(`${BASE}/tenant/${tenantId}`, {
      method: 'GET',
    }),

  create: (data: TenantPlanCreateApi) =>
    apiFetch<TenantPlanApi>(BASE + '/', {
      method: 'POST',
      body: data,
    }),

  update: (id: number, data: TenantPlanUpdateApi) =>
    apiFetch<TenantPlanApi>(`${BASE}/${id}`, {
      method: 'PUT',
      body: data,
    }),

  delete: (id: number) =>
    apiFetch<{ message: string }>(`${BASE}/${id}`, {
      method: 'DELETE',
    }),

  listEnrollments: (tenantId: number) =>
    apiFetch<EnrollmentDetailApi[]>(
      `${BASE}/tenant/${tenantId}/enrollments`,
      { method: 'GET' }
    ),

  enroll: (tenantId: number, planId: number) =>
    apiFetch<EnrollmentApi>(
      `${BASE}/enroll?tenant_id=${tenantId}&plan_id=${planId}`,
      {
        method: 'POST',
      }
    ),

  getPricingBounds: (tenantId: number) =>
    apiFetch<PricingBoundsApi>(
      `${BASE}/pricing-bounds?tenant_id=${tenantId}`,
      { method: 'GET' }
    ),

  myEnrollment: (tenantId: number) =>
    apiFetch<EnrollmentApi>(
      `${BASE}/my-enrollment?tenant_id=${tenantId}`,
      { method: 'GET' }
    ),

  cancelEnrollment: (tenantId: number) =>
    apiFetch<EnrollmentApi>(
      `${BASE}/cancel-enrollment?tenant_id=${tenantId}`,
      { method: 'POST' }
    ),

  pricingBounds: (tenantId: number) =>
    apiFetch<PricingBoundsApi>(
      `${BASE}/pricing-bounds?tenant_id=${tenantId}`,
      { method: 'GET' }
    ),
};
