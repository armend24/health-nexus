/**
 * useFeatureFlag(featureKey)
 * ==========================
 * React hook that resolves whether a feature is enabled for the current
 * user's tenant. Fetches from the backend on first call per key, then
 * caches the result for the component's lifetime.
 *
 * Returns:
 *   - enabled: boolean  (false while loading, false on error)
 *   - loading: boolean
 *
 * Usage:
 *   const { enabled } = useFeatureFlag('advanced_reports');
 *   if (!enabled) return <UpgradePrompt />;
 */
import { useAuthStore } from '@/stores/auth.store';
import { useFeatureFlagsStore } from '@/stores/feature-flags.store';
import { useEffect, useMemo } from 'react';

interface FeatureFlagState {
  enabled: boolean;
  loading: boolean;
}

export function useFeatureFlag(featureKey: string): FeatureFlagState {
  const tenantId = useAuthStore((state) => state.tenantId);
  const setTenantScope = useFeatureFlagsStore(
    (state) => state.setTenantScope
  );
  const ensureFlag = useFeatureFlagsStore(
    (state) => state.ensureFlag
  );
  const entry = useFeatureFlagsStore(
    (state) => state.flags[featureKey]
  );

  useEffect(() => {
    setTenantScope(tenantId);
  }, [setTenantScope, tenantId]);

  useEffect(() => {
    void ensureFlag(featureKey);
  }, [ensureFlag, featureKey]);

  return useMemo(
    () => ({
      enabled: entry?.enabled ?? false,
      loading: entry?.loading ?? true,
    }),
    [entry?.enabled, entry?.loading]
  );
}
