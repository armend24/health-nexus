import { useAuthStore } from '@/stores/auth.store';
import { useFeatureFlagsStore } from '@/stores/feature-flags.store';
import { useEffect, useMemo } from 'react';

interface UseFeatureFlagsResult {
  loading: boolean;
  enabled: boolean;
  states: Record<string, boolean>;
}

export function useFeatureFlags(
  featureKeys: string[],
  mode: 'all' | 'any' = 'all'
): UseFeatureFlagsResult {
  const stableKeys = useMemo(
    () => [...new Set(featureKeys)].sort(),
    [featureKeys.join('|')]
  );
  const tenantId = useAuthStore((state) => state.tenantId);
  const setTenantScope = useFeatureFlagsStore(
    (state) => state.setTenantScope
  );
  const ensureFlags = useFeatureFlagsStore(
    (state) => state.ensureFlags
  );
  const flags = useFeatureFlagsStore((state) => state.flags);

  useEffect(() => {
    setTenantScope(tenantId);
  }, [setTenantScope, tenantId]);

  useEffect(() => {
    if (stableKeys.length === 0) return;
    void ensureFlags(stableKeys);
  }, [ensureFlags, stableKeys]);

  return useMemo(() => {
    const states: Record<string, boolean> = {};
    const entries = stableKeys.map((key) => {
      const entry = flags[key];
      const enabled = entry?.enabled ?? false;
      states[key] = enabled;
      return {
        key,
        enabled,
        loading: entry?.loading ?? true,
      };
    });

    const loading = entries.some((entry) => entry.loading);
    const enabled =
      mode === 'all'
        ? entries.every((entry) => entry.enabled)
        : entries.some((entry) => entry.enabled);

    return {
      loading,
      enabled,
      states,
    };
  }, [stableKeys, flags, mode]);
}
