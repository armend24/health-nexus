/**
 * Shared auth + RBAC guard logic. Single place for "ensure auth, then decide redirect".
 *
 * - Unauthenticated → { to: '/login', search } (preserves redirect param when possible).
 * - Authenticated but forbidden (RBAC) → { to: '/unauthorized' }.
 * - Otherwise → null (allow access).
 */
import { can, type UserWithRole } from '@/lib/rbac';
import type { RouteKey } from '@/lib/rbacMatrix';
import { useAuthStore } from '@/stores/auth.store';
import { redirect } from '@tanstack/react-router';

export type RequireAuthOptions = {
  routeKey?: RouteKey;
};

export type ProtectedRedirect =
  | {
      to: '/login';
      search: {
        reason?: 'expired' | 'revoked';
        redirect?: string;
      };
    }
  | { to: '/unauthorized' };

/**
 * Runs ensureAuth(), then returns redirect payload if user should be sent to login or unauthorized; otherwise null.
 * Pass currentPath when available (e.g. from router location) so login can redirect back; otherwise uses window.
 */
export async function getProtectedRedirect(
  options?: RequireAuthOptions,
  currentPath?: string
): Promise<ProtectedRedirect | null> {
  const { ensureAuth } = useAuthStore.getState();
  await ensureAuth();

  const state = useAuthStore.getState();
  if (!state.isAuthenticated) {
    const search: {
      reason?: 'expired' | 'revoked';
      redirect?: string;
    } = {};
    if (state.authErrorReason) search.reason = state.authErrorReason;
    const rawPath =
      currentPath ??
      (typeof window !== 'undefined'
        ? window.location.pathname
        : undefined);
    // Only use pathname for redirect; avoid long encoded search strings (tokens, codes, state).
    const path =
      typeof rawPath === 'string' &&
      rawPath.startsWith('/') &&
      !rawPath.startsWith('//')
        ? (rawPath.split('?')[0]?.trim() ?? rawPath)
        : undefined;
    if (path && path !== '/login' && path.length <= 256)
      search.redirect = path;
    return { to: '/login', search };
  }

  if (options?.routeKey) {
    const user: UserWithRole = {
      role: state.role,
    };
    if (!can(user, options.routeKey)) return { to: '/unauthorized' };
  }
  return null;
}

/** Returns a beforeLoad handler: throws redirect to /login or /unauthorized when access is denied. */
export function requireAuth(
  options?: RequireAuthOptions
): () => Promise<void> {
  return async () => {
    const result = await getProtectedRedirect(options);
    if (result) throw redirect(result);
  };
}
