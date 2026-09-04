import { useFeatureFlags } from '@/stores/use-feature-flags';
import type { ReactNode } from 'react';

interface PermissionGuardProps {
  featureKeys: string[];
  mode?: 'all' | 'any';
  children: ReactNode;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

/**
 * Guard UI by one or many feature flags resolved for the current tenant.
 * - mode='all': every feature key must be enabled
 * - mode='any': at least one feature key must be enabled
 */
export function PermissionGuard({
  featureKeys,
  mode = 'all',
  children,
  fallback = null,
  loadingFallback = null,
}: PermissionGuardProps) {
  const { enabled, loading } = useFeatureFlags(featureKeys, mode);

  if (loading) return <>{loadingFallback}</>;
  return enabled ? <>{children}</> : <>{fallback}</>;
}
