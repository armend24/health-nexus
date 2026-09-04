/**
 * Root layout: outlet, bootstrap rehydration, session-expiration redirect, and a global 404.
 * On mount, if a token exists in storage we call ensureAuth() to hydrate user from /auth/me.
 */
import { AIAssistantWidget } from '@/components/AIAssistantWidget';
import { GlobalDialog } from '@/components/global-dialog';
import { NotFoundPage } from '@/components/NotFoundPage';
import { getAccessToken } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import {
  Outlet,
  createRootRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authErrorReason = useAuthStore((s) => s.authErrorReason);
  const ensureAuth = useAuthStore((s) => s.ensureAuth);

  // Bootstrap: rehydrate from persisted token (load user via /auth/me).
  useEffect(() => {
    if (getAccessToken() && !isAuthenticated) {
      ensureAuth();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  // Session expiration: redirect to /login with reason – skip on public pages so /landing/:slug stays public with stale token.
  const isPublicPage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname.startsWith('/landing/');
  useEffect(() => {
    if (isPublicPage) return;
    if (
      !isAuthenticated &&
      (authErrorReason === 'expired' || authErrorReason === 'revoked')
    ) {
      navigate({
        to: '/login',
        search: {
          reason: authErrorReason,
          redirect: undefined,
        },
        replace: true,
      });
    }
  }, [
    authErrorReason,
    isAuthenticated,
    isPublicPage,
    navigate,
    pathname,
  ]);

  return (
    <>
      <div className="min-h-screen">
        <Outlet />
      </div>
      <GlobalDialog />
      <AIAssistantWidget />
    </>
  );
}
