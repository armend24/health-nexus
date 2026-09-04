/**
 * Feature Flag API
 * ================
 * Client-side API calls for the feature flag engine.
 *
 * Evaluate endpoint:
 *   GET /api/feature-flags/{feature_key}
 *   → { feature_key, enabled, tenant_id }
 *
 * Admin endpoints (super_admin only):
 *   POST   /api/superadmin/feature-flags/defaults
 *   POST   /api/superadmin/feature-flags/overrides
 *   DELETE /api/superadmin/feature-flags/defaults/{id}
 *   DELETE /api/superadmin/feature-flags/overrides/{id}
 *   GET    /api/superadmin/feature-flags
 */
import { api } from './api-client';

export interface FlagEvalResult {
  feature_key: string;
  enabled: boolean;
  tenant_id: number;
}

export interface FeatureFlagRecord {
  id: number;
  tenant_id: number | null;
  feature_key: string;
  enabled: boolean;
  plan_tier: string | null;
}

export interface PlanDefaultPayload {
  plan_tier: string;
  feature_key: string;
  enabled: boolean;
}

export interface TenantOverridePayload {
  tenant_id: number;
  feature_key: string;
  enabled: boolean;
}

/** Resolve a single feature flag for the calling user's tenant. */
export async function evaluateFlag(
  featureKey: string
): Promise<FlagEvalResult> {
  return api.get<FlagEvalResult>(`/api/feature-flags/${featureKey}`);
}

/** [Admin] List all feature flags (plan defaults + tenant overrides). */
export async function listFlags(): Promise<FeatureFlagRecord[]> {
  return api.get<FeatureFlagRecord[]>(
    '/api/superadmin/feature-flags'
  );
}

/** [Admin] Create or update a plan-level default. */
export async function upsertPlanDefault(
  payload: PlanDefaultPayload
): Promise<FeatureFlagRecord> {
  return api.post<FeatureFlagRecord>(
    '/api/superadmin/feature-flags/defaults',
    payload
  );
}

/** [Admin] Create or update a per-tenant override. */
export async function upsertTenantOverride(
  payload: TenantOverridePayload
): Promise<FeatureFlagRecord> {
  return api.post<FeatureFlagRecord>(
    '/api/superadmin/feature-flags/overrides',
    payload
  );
}

/** [Admin] Delete a plan default by id. */
export async function deletePlanDefault(id: number): Promise<void> {
  return api.delete(`/api/superadmin/feature-flags/defaults/${id}`);
}

/** [Admin] Delete a tenant override by id. */
export async function deleteTenantOverride(
  id: number
): Promise<void> {
  return api.delete(`/api/superadmin/feature-flags/overrides/${id}`);
}
