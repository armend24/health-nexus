/**
 * FeatureGate
 * ===========
 * Renders `children` only when the given feature flag is enabled for the
 * current user's tenant.  Renders `fallback` when disabled or on error.
 * Renders `loadingFallback` (default: null) while the flag is being fetched.
 *
 * Usage:
 *   <FeatureGate featureKey="advanced_reports" fallback={<UpgradePrompt />}>
 *     <AdvancedReports />
 *   </FeatureGate>
 */
import { useFeatureFlag } from '@/stores/use-feature-flag';
import type { ReactNode } from 'react';

interface FeatureGateProps {
  featureKey: string;
  children: ReactNode;
  /** Rendered when the flag is disabled or the API returns an error. Default: null. */
  fallback?: ReactNode;
  /** Rendered while the flag evaluation is in flight. Default: null. */
  loadingFallback?: ReactNode;
}

export function FeatureGate({
  featureKey,
  children,
  fallback = null,
  loadingFallback = null,
}: FeatureGateProps) {
  const { enabled, loading } = useFeatureFlag(featureKey);
  if (loading) return <>{loadingFallback}</>;
  return enabled ? <>{children}</> : <>{fallback}</>;
}
