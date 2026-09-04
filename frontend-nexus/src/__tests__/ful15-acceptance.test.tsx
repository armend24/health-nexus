/**
 * FUL-15 acceptance tests: table-driven scenarios for auth guarding and session expiration.
 *
 * - No real network: global fetch is mocked; /auth/me and dummyjson are stubbed.
 * - Uses TanStack Router (routeTree) + Testing Library, following rbac-guards patterns.
 *
 * Scenarios:
 * 1. Unauthenticated user visiting protected route → redirected to /login
 * 2. Authenticated but forbidden role visiting route → redirected to /unauthorized
 * 3. Authenticated + allowed role → route renders
 * 4. Session expiration: API returns 401 → user logged out, redirected to /login (reason=expired)
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

jest.mock(
  '@/lib/dashboard-data.json',
  () => ({ __esModule: true, default: [] }),
  {
    virtual: true,
  }
);

type BackendRole =
  | 'admin'
  | 'doctor'
  | 'sales'
  | 'tenant_manager'
  | 'super_admin'
  | 'client';

function backendRoleFor(role: Role): BackendRole {
  const map: Record<Role, BackendRole> = {
    SUPER_ADMIN: 'admin',
    TENANT_MANAGER: 'tenant_manager',
    DOCTOR: 'doctor',
    SALES: 'sales',
    CLIENT: 'client',
  };
  return map[role] ?? 'admin';
}

const ROUTES: Array<{
  path: string;
  routeKey: RouteKey;
  expectHeading?: RegExp;
  expectText?: RegExp;
}> = [
  {
    path: '/dashboard',
    routeKey: 'DASHBOARD_HOME',
    expectText: /Health Nexus/i,
  },
  {
    path: '/dashboard/data',
    routeKey: 'DASHBOARD_DATA',
    expectHeading: /Data Fetching/i,
  },
  {
    path: '/dashboard/forms',
    routeKey: 'DASHBOARD_FORMS',
    expectHeading: /Form \+ Mutation/i,
  },
];

let meStatus = 200;
let meRole: BackendRole = 'admin';

function setMeOk(role: BackendRole) {
  meStatus = 200;
  meRole = role;
  setTokens({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
  });
}

function setMe401() {
  meStatus = 401;
  setTokens({
    accessToken: 'expired-token',
    refreshToken: 'test-refresh',
  });
}

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

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  clearTokens();
  meStatus = 200;
  meRole = 'admin';

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

describe('FUL-15 acceptance', () => {
  it('unauthenticated user visiting protected route is redirected to /login', async () => {
    const router = createTestRouter();
    renderApp(router);

    await act(async () => {
      router.navigate({ to: '/dashboard' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('authenticated but forbidden role visiting route is redirected to /unauthorized', async () => {
    useAuthStore.getState().clearAuth();
    setMeOk(backendRoleFor('SALES'));
    const router = createTestRouter();
    renderApp(router);
    // Navigate to parent first so child beforeLoad runs after parent state is settled (same as table-driven order)
    await act(async () => {
      await router.navigate({ to: '/dashboard' });
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId('login-page')
      ).not.toBeInTheDocument();
    });
    await act(async () => {
      await router.navigate({
        to: '/dashboard/data',
      });
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('unauthorized-page')
      ).toBeInTheDocument();
    });
  });

  it('authenticated allowed role sees route content', async () => {
    setMeOk(backendRoleFor('SUPER_ADMIN'));
    const router = createTestRouter();
    renderApp(router);

    await act(async () => {
      router.navigate({ to: '/dashboard' });
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('unauthorized-page')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('login-page')
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByText(/Health Nexus/i).length
      ).toBeGreaterThan(0);
    });
  });

  it('session expiration: API returns 401 → user logged out and redirected to /login', async () => {
    setMe401();
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

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('FUL-15 table-driven role × route matrix', () => {
  const roles: Role[] = [
    'SUPER_ADMIN',
    'TENANT_MANAGER',
    'DOCTOR',
    'SALES',
  ];

  ROUTES.forEach((route) => {
    roles.forEach((role) => {
      const allowed = canAccess(role, route.routeKey);
      it(`${role} visiting ${route.path} → ${allowed ? 'renders' : 'unauthorized'}`, async () => {
        useAuthStore.getState().clearAuth();
        setMeOk(backendRoleFor(role));
        const router = createTestRouter();
        const { unmount } = renderApp(router);

        await act(async () => {
          router.navigate({ to: route.path });
        });

        if (allowed) {
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
      });
    });
  });
});
