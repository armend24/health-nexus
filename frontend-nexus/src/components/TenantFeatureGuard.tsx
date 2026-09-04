import { useAuthStore } from '@/stores/auth.store';
import type { ReactNode } from 'react';
import { FeatureGate } from './FeatureGate';

interface TenantFeatureGuardProps {
  featureKey: string;
  children: ReactNode;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

/**
 * Applies feature-flag gating only for TENANT_MANAGER users.
 * Other roles always see children.
 */
export function TenantFeatureGuard({
  featureKey,
  children,
  fallback,
  loadingFallback,
}: TenantFeatureGuardProps) {
  const role = useAuthStore((state) => state.role);
  if (role !== 'TENANT_MANAGER') return <>{children}</>;

  return (
    <FeatureGate
      featureKey={featureKey}
      fallback={fallback}
      loadingFallback={loadingFallback}
    >
      {children}
    </FeatureGate>
  );
}
