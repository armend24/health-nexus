/**
 * Acceptance tests for auth guarding and RBAC route matrix.
 *
 * - Uses the real TanStack route tree and auth store (no mocked router).
 * - Mocks global fetch: /auth/me returns user by role; other URLs return safe defaults.
 * - Verifies: unauthenticated → /login; 401 on /auth/me → /login?reason=expired; and that
 *   each role can or cannot access each dashboard route per src/lib/rbacMatrix.ts.
 */
import { clearTokens, setTokens } from '@/lib/api-client';
import {
  canAccess,
  type Role,
  type RouteKey,
} from '@/lib/rbacMatrix';
import { useAuthStore } from '@/stores/auth.store';
import { jest } from '@jest/globals';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import { routeTree } from '../routeTree.gen';

// Dashboard index imports this JSON; stub it in Jest to avoid file-loader issues.
jest.mock(
  '@/lib/dashboard-data.json',
  () => ({ __esModule: true, default: [] }),
  {
    virtual: true,
  }
);

/** Backend /auth/me returns role as lowercase string; we mirror that in the mock. */
type BackendRole =
  | 'admin'
  | 'doctor'
  | 'sales'
  | 'tenant_manager'
  | 'client'
  | 'super_admin';

/** Map frontend Role (UPPER_SNAKE) to the string the backend sends in /auth/me user.role. */
function backendRoleForFrontend(role: Role): BackendRole {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'admin';
    case 'TENANT_MANAGER':
      return 'tenant_manager';
    case 'DOCTOR':
      return 'doctor';
    case 'SALES':
      return 'sales';
    case 'CLIENT':
      return 'client';
  }
}

/** Dashboard routes under test: path, route key for canAccess(), and how we assert allowed access. */
const ROUTES: Array<{
  key: RouteKey;
  path: string;
  expectHeading?: RegExp;
  expectText?: RegExp;
}> = [
  {
    key: 'DASHBOARD_HOME',
    path: '/dashboard',
    expectText: /Health Nexus/i,
  },
  {
    key: 'DASHBOARD_DATA',
    path: '/dashboard/data',
    expectHeading: /Data Fetching/i,
  },
  {
    key: 'DASHBOARD_FORMS',
    path: '/dashboard/forms',
    expectHeading: /Form \+ Mutation/i,
  },
  {
    key: 'DASHBOARD_GLOBAL_STATE',
    path: '/dashboard/global-state',
    expectHeading: /Zustand/i,
  },
  {
    key: 'DASHBOARD_LANDING_PAGES',
    path: '/dashboard/landing-pages',
    expectHeading: /Landing Pages/i,
  },
];

function createTestRouter() {
  return createRouter({
    routeTree,
    defaultPreload: false,
  });
}

function renderApp(router: ReturnType<typeof createTestRouter>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

/** Controls mock /auth/me: 200 with meRole, or 401 for session-expired tests. */
let meStatus: number = 200;
let meRole: BackendRole = 'admin';

/** Set up “authenticated” state: store has tokens, next /auth/me will return 200 with given role. */
function setAuthenticatedMe(role: BackendRole) {
  meStatus = 200;
  meRole = role;
  setTokens({
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
  });
}

/** Set up “session expired”: store has a token but /auth/me will return 401. */
function setMeUnauthorized() {
  meStatus = 401;
  setTokens({
    accessToken: 'expired-access-token',
    refreshToken: 'test-refresh-token',
  });
}

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  clearTokens();
  meStatus = 200;
  meRole = 'admin';

  // Single fetch mock for all tests: /auth/me drives auth; dummyjson and others get safe stubs.
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/auth/me')) {
      if (meStatus === 401)
        return new Response(null, {
          status: 401,
        });
      return new Response(
        JSON.stringify({
          message: 'You are authenticated',
          user: {
            user_id: '1',
            email: 'test@example.com',
            role: meRole,
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Dashboard data/forms pages may call this; stub so tests don't hit the network.
    if (url.startsWith('https://dummyjson.com/users')) {
      return new Response(
        JSON.stringify({
          users: [],
          total: 0,
          skip: 0,
          limit: 30,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }) as unknown as typeof fetch;
});

describe('Auth guarding + RBAC route matrix', () => {
  it('redirects unauthenticated user to /login when visiting protected dashboard', async () => {
    // No token, no setAuthenticatedMe → ensureAuth() fails → beforeLoad redirects to /login.
    const router = createTestRouter();
    renderApp(router);

    await act(async () => {
      router.navigate({ to: '/dashboard' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('redirects to /login?reason=expired when /auth/me returns 401', async () => {
    // Token present but /auth/me returns 401 → unauthorized handler calls expireSession() → reason=expired.
    setMeUnauthorized();
    const router = createTestRouter();
    renderApp(router);

    await act(async () => {
      router.navigate({ to: '/dashboard' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
      expect(
        screen.getByTestId('session-reason-message')
      ).toHaveTextContent(/Session expired/i);
    });
  });

  it('enforces the role/route matrix across dashboard routes', async () => {
    // For each role and each route: navigate, then assert allowed → page content, denied → /unauthorized.
    const roles: Role[] = [
      'SUPER_ADMIN',
      'TENANT_MANAGER',
      'DOCTOR',
      'SALES',
      'CLIENT',
    ];

    for (const role of roles) {
      for (const route of ROUTES) {
        const router = createTestRouter();
        useAuthStore.getState().clearAuth();
        setAuthenticatedMe(backendRoleForFrontend(role));
        const { unmount } = renderApp(router);

        await act(async () => {
          router.navigate({ to: route.path });
        });

        const shouldAllow = canAccess(role, route.key);

        if (shouldAllow) {
          await waitFor(() => {
            expect(
              screen.queryByTestId('unauthorized-page')
            ).not.toBeInTheDocument();
            if (route.expectHeading)
              expect(
                screen.getByRole('heading', {
                  name: route.expectHeading,
                })
              ).toBeInTheDocument();
            if (route.expectText)
              expect(
                screen.getAllByText(route.expectText).length
              ).toBeGreaterThan(0);
          });
        } else {
          await waitFor(() => {
            expect(
              screen.getByTestId('unauthorized-page')
            ).toBeInTheDocument();
          });
        }

        unmount();
      }
    }
  });
});
