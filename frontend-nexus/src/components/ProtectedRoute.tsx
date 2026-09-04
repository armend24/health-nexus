/**
 * Wrapper that validates token + role before rendering children.
 * Uses shared getProtectedRedirect(); use when guarding a subtree without route-level beforeLoad.
 */
import {
  getProtectedRedirect,
  type ProtectedRedirect,
  type RequireAuthOptions,
} from '@/lib/guards/requireAuth';
import { Navigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';

export interface ProtectedRouteProps extends RequireAuthOptions {
  children: ReactNode;
  /** Shown while auth is being checked. Default: null. */
  fallback?: ReactNode;
}

export function ProtectedRoute({
  children,
  routeKey,
  fallback = null,
}: ProtectedRouteProps) {
  const [redirect, setRedirect] = useState<
    ProtectedRedirect | null | undefined
  >(undefined);
  const location = useRouterState({
    select: (s) => s.location,
  });

  useEffect(() => {
    let cancelled = false;
    // Use pathname only for redirect; avoid passing tokens/codes from search params
    const currentPath = location.pathname;

    getProtectedRedirect(
      routeKey != null ? { routeKey } : undefined,
      currentPath
    ).then((result) => {
      if (!cancelled) setRedirect(result ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, routeKey]);

  if (redirect === undefined) return <>{fallback}</>;
  if (redirect) {
    const search =
      redirect.to === '/login' ? redirect.search : undefined;
    return <Navigate to={redirect.to} search={search} replace />;
  }
  return <>{children}</>;
}
