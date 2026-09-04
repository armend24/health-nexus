/**
 * Clients service: patient registration under a specific tenant.
 * Uses POST /api/public/tenants/{tenant_id}/clients/register (public route, Bearer optional).
 */
import { api } from '@/lib/api-client';

/** Body for POST /api/public/tenants/{tenant_id}/clients/register */
export interface ClientRegistrationRequest {
  email: string;
  first_name?: string;
  last_name?: string;
  birthdate?: string | null;
  gender?: string | null;
  blood_type?: string | null;
}

/** Response from the patient registration endpoint */
export interface ClientRegistrationResponse {
  user_id: string | number;
  patient_id: string | number;
  tenant_id: string | number;
}

export const clientsService = {
  /**
   * Register the currently logged-in user as a patient under the given tenant.
   * @param tenantId  - numeric tenant id from the landing page route
   * @param data      - registration form data; email must come from auth context
   */
  registerAsPatient: (
    tenantId: number,
    data: ClientRegistrationRequest
  ) =>
    api.post<ClientRegistrationResponse>(
      `/api/public/tenants/${tenantId}/clients/register`,
      data
    ),
};
