/**
 * FUL-12 acceptance tests: tenant management and audit logs routes.
 *
 * - No real network: global fetch is mocked; /auth/me, /api/superadmin/tenants, /audit-logs stubbed.
 * - Verifies RBAC: SUPER_ADMIN can access tenants and audit-logs; other roles are unauthorized.
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

const FUL12_ROUTES: Array<{
  path: string;
  routeKey: RouteKey;
  expectHeading: RegExp;
}> = [
  {
    path: '/dashboard/tenants',
    routeKey: 'DASHBOARD_TENANTS',
    expectHeading: /Tenant Management/i,
  },
  {
    path: '/dashboard/audit-logs',
    routeKey: 'DASHBOARD_AUDIT_LOGS',
    expectHeading: /Audit Logs/i,
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

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  clearTokens();

  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/auth/me')) {
      return new Response(
        JSON.stringify({
          message: 'You are authenticated',
          user: {
            user_id: '1',
            email: 'test@example.com',
            role: 'admin',
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
    if (
      url.includes('/api/superadmin/tenants') ||
      url.includes('/superadmin/tenants')
    ) {
      return new Response(
        JSON.stringify([
          {
            id: 1,
            name: 'Test Clinic',
            email: 'test@clinic.com',
            licence_number: 'TST-001',
            status: 'pending',
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-01T00:00:00Z',
          },
        ]),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
    if (url.includes('/audit-logs')) {
      return new Response(
        JSON.stringify([
          {
            id: 1,
            tenant_id: 1,
            event_type: 'STATUS_CHANGE',
            entity_name: 'tenant',
            entity_id: 1,
            old_value: { status: 'pending' },
            new_value: { status: 'approved' },
            performed_by_role: 'SUPER_ADMIN',
            reason: null,
            created_at: '2026-02-01T00:00:00Z',
          },
        ]),
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

describe('FUL-12 tenant management and audit logs', () => {
  const roles: Role[] = [
    'SUPER_ADMIN',
    'TENANT_MANAGER',
    'DOCTOR',
    'SALES',
  ];

  FUL12_ROUTES.forEach((route) => {
    roles.forEach((role) => {
      const allowed = canAccess(role, route.routeKey);
      it(`${role} visiting ${route.path} → ${allowed ? 'renders' : 'unauthorized'}`, async () => {
        useAuthStore.getState().clearAuth();
        setTokens({
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
        });
        const roleStr = backendRoleFor(role);

        globalThis.fetch = jest.fn(
          async (input: RequestInfo | URL) => {
            const url =
              typeof input === 'string' ? input : input.toString();
            if (url.includes('/auth/me')) {
              return new Response(
                JSON.stringify({
                  message: 'You are authenticated',
                  user: {
                    user_id: '1',
                    email: 'test@example.com',
                    role: roleStr,
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
            if (
              url.includes('/api/superadmin/tenants') ||
              url.includes('/superadmin/tenants')
            ) {
              return new Response(
                JSON.stringify([
                  {
                    id: 1,
                    name: 'Test',
                    email: 't@t.com',
                    licence_number: 'T-1',
                    status: 'pending',
                    created_at: '2026-02-01T00:00:00Z',
                    updated_at: '2026-02-01T00:00:00Z',
                  },
                ]),
                {
                  status: 200,
                  headers: {
                    'Content-Type': 'application/json',
                  },
                }
              );
            }
            if (url.includes('/audit-logs')) {
              return new Response(
                JSON.stringify([
                  {
                    id: 1,
                    tenant_id: 1,
                    event_type: 'STATUS_CHANGE',
                    entity_name: 'tenant',
                    entity_id: 1,
                    old_value: {},
                    new_value: {},
                    performed_by_role: 'SUPER_ADMIN',
                    reason: null,
                    created_at: '2026-02-01T00:00:00Z',
                  },
                ]),
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
          }
        ) as unknown as typeof fetch;

        const router = createTestRouter();
        const { unmount } = renderApp(router);

        await act(async () => {
          await router.navigate({
            to: route.path,
          });
        });

        if (allowed) {
          await waitFor(() => {
            expect(
              screen.queryByTestId('unauthorized-page')
            ).not.toBeInTheDocument();
            expect(
              screen.getByRole('heading', {
                name: route.expectHeading,
              })
            ).toBeInTheDocument();
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
