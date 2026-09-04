// Checks if the current user is enrolled (patient) for the current tenant.
// FIX: apiFetch() already parses JSON and returns the data object directly —
// the old code treated it as a raw Response (res.ok / res.json()), which always
// evaluated to false and redirected every patient to /enrollment.
export async function checkEnrollment(
  tenantId: string
): Promise<boolean> {
  try {
    const { apiFetch } = await import('@/lib/api-client');
    const data = await apiFetch<{
      enrolled: boolean;
    }>(`/appointments/enrollment-status?tenant_id=${tenantId}`);
    return !!data.enrolled;
  } catch {
    return false;
  }
}
/**
 * Auth service: login, current user, refresh, logout.
 * Uses shared client (Bearer token, 401 handler) from lib/api-client.
 */
import { request } from '@/lib/api-client';

const BASE = '/api/auth';

/** Request body for POST /api/auth/signup */
export type SignupRequest = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: string;
};

/** Response from POST /api/auth/signup */
export type SignupResponse = {
  user_id: string | number;
  email: string;
  role: string;
};

/** Payload for POST /api/auth/login */
export type LoginCredentials = {
  email: string;
  password: string;
};

/** Response from login and refresh */
export type TokenResponse = {
  access_token: string;
  token_type: 'bearer';
  refresh_token: string | null;
};

/** Response from GET /api/auth/me */
export type MeResponse = {
  message: string;
  user: {
    user_id: string | number;
    email: string;
    role?: string;
    tenant_id?: string | number;
    [key: string]: unknown;
  };
};

export type RefreshResponse = {
  access_token: string;
  token_type: 'bearer';
  refresh_token?: string | null;
};

export const authService = {
  login: (credentials: LoginCredentials) =>
    request<TokenResponse>(`${BASE}/login`, {
      method: 'POST',
      body: credentials,
    }),

  me: () =>
    request<MeResponse>(`${BASE}/me`, {
      method: 'GET',
    }),

  refresh: (refresh_token: string) =>
    request<RefreshResponse>(`${BASE}/refresh`, {
      method: 'POST',
      body: { refresh_token },
    }),

  logout: (refresh_token: string) =>
    request<{ message: string }>(`${BASE}/logout`, {
      method: 'POST',
      body: { refresh_token },
    }),

  signup: (data: SignupRequest) =>
    request<SignupResponse>(`${BASE}/signup`, {
      method: 'POST',
      body: data,
    }),
};
