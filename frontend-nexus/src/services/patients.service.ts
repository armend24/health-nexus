import { api } from '@/lib/api-client';

export interface PatientTenantMembership {
  tenant_id: number;
  name: string;
  status?: string | null;
}

export interface PatientProfileRead {
  tenant_id: number;
  user_id: string | number;
  birthdate?: string | null;
  gender?: string | null;
  blood_type?: string | null;
}

export interface PatientProfileUpdate {
  birthdate?: string | null;
  gender?: string | null;
  blood_type?: string | null;
}

export const patientsService = {
  listMyTenants: () =>
    api.get<PatientTenantMembership[]>('/api/patients/me/tenants'),

  getMyTenantProfile: (tenantId: number) =>
    api.get<PatientProfileRead>(
      `/api/tenants/${tenantId}/patients/me`
    ),

  updateMyTenantProfile: (
    tenantId: number,
    data: PatientProfileUpdate
  ) =>
    api.patch<PatientProfileRead>(
      `/api/tenants/${tenantId}/patients/me`,
      data
    ),
};
