import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useQuery } from '@tanstack/react-query';

const ENROLLMENTS_BASE = (tenantId: number) =>
  `api/tenants/${tenantId}/enrollments`;

export type EnrollmentStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'CANCELLED'
  | 'EXPIRED';

export interface EnrollmentStatusApi {
  id: number;
  status: EnrollmentStatus;
  patient_user_id: number;
  user_tenant_plan_id: number;
  tenant_id: number;
  activated_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface EnrollmentCreateApi {
  patient_user_id: number;
  user_tenant_plan_id: number;
}

export interface EnrollmentOperationalStatusApi {
  status: string;
  is_active: boolean;
  is_expired: boolean;
  can_transition: boolean;
}
export interface EnrollmentStatusHistoryApi {
  id: number;
  enrollment_id: number;
  tenant_id: number;
  old_status: EnrollmentStatus;
  new_status: EnrollmentStatus;
  changed_by: number | null;
  changed_by_role: string | null;
  reason: string | null;
  changed_at: string;
}

export const enrollmentsService = {
  list: (tenantId: number, patientUserId?: number) =>
    apiFetch<EnrollmentStatusApi[]>(
      `${ENROLLMENTS_BASE(tenantId)}${patientUserId ? `?patient_user_id=${patientUserId}` : ''}`,
      { method: 'GET' }
    ),

  get: (tenantId: number, enrollmentId: number) =>
    apiFetch<EnrollmentStatusApi>(
      `${ENROLLMENTS_BASE(tenantId)}/${enrollmentId}`,
      {
        method: 'GET',
      }
    ),

  create: (tenantId: number, body: EnrollmentCreateApi) =>
    apiFetch<EnrollmentStatusApi>(ENROLLMENTS_BASE(tenantId), {
      method: 'POST',
      body,
    }),

  transition: (
    tenantId: number,
    enrollmentId: number,
    target_status: 'PENDING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED',
    reason?: string
  ) =>
    apiFetch<EnrollmentStatusApi>(
      `${ENROLLMENTS_BASE(tenantId)}/${enrollmentId}/transition`,
      {
        method: 'POST',
        body: { target_status, reason },
      }
    ),

  operationalStatus: (tenantId: number, enrollmentId: number) =>
    apiFetch<EnrollmentOperationalStatusApi>(
      `${ENROLLMENTS_BASE(tenantId)}/${enrollmentId}/status`,
      { method: 'GET' }
    ),
  getHistory: (tenantId: number) =>
    apiFetch<EnrollmentStatusHistoryApi[]>(
      `${ENROLLMENTS_BASE(tenantId)}/history`,
      {
        method: 'GET',
      }
    ),
  listMyEnrollments: () =>
    apiFetch<EnrollmentStatusApi[]>(`/api/enrollments/me`, {
      method: 'GET',
    }),
};

// --- Appointment booking: approved tenants with doctors ---

export interface EnrollmentDoctor {
  user_id: number;
  name: string;
  specialization: string | null;
}

export interface ApprovedTenant {
  id: number;
  name: string;
  moto: string | null;
  doctors: EnrollmentDoctor[];
}

async function fetchApprovedTenants(): Promise<ApprovedTenant[]> {
  const res = await apiFetch('/enrollments/approved-tenants');
  if (!res.ok) throw new Error('Failed to load approved tenants');
  return res.json();
}

export function useApprovedTenants() {
  const token = useAuthStore((s) => s.token);
  return useQuery<ApprovedTenant[]>({
    queryKey: ['approved-tenants'],
    queryFn: fetchApprovedTenants,
    enabled: !!token,
  });
}
