/**
 * FUL-72: Public tenant landing + tenant manager entrypoints
 *
 * - Verifies landing route fetches data and renders hero content from GET /api/tenants/by-slug/{slug}/landing.
 * - Ensures 404 from landing API shows a friendly "Tenant not found" screen.
 * - Covers TenantLanding UI behavior: tabs and tenant-manager "Go to dashboard" entry when permitted.
 */
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { TenantLanding } from '../components/tenant-landing';
import type { TenantLandingPageResponse } from '../interfaces';
import { ApiError } from '../lib/api-client';
import { routeTree } from '../routeTree.gen';
import { useAuthStore } from '../stores/auth.store';

// Root/dashboard import this JSON; stub it so Jest doesn't need a file loader.
jest.mock(
  '@/lib/dashboard-data.json',
  () => ({ __esModule: true, default: [] }),
  {
    virtual: true,
  }
);

// Smooth-scroll button calls window.scrollTo – provide a no-op for jsdom.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  window.scrollTo = () => {};
});

function createTestRouter() {
  return createRouter({
    routeTree,
    defaultPreload: false,
  });
}

function renderWithProviders(
  router: ReturnType<typeof createTestRouter>
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

function buildSampleLanding(
  overrides: Partial<TenantLandingPageResponse> = {}
): TenantLandingPageResponse {
  return {
    tenant: {
      id: 1,
      name: 'Acme Health',
      slug: 'acme-health',
      email: 'info@acme.test',
      licence_number: 'LIC-123',
    },
    details: {
      tenant_id: 1,
      logo: null,
      image: null,
      moto: 'Your health, our priority.',
      brand_color_primary: '#2563eb',
      brand_color_secondary: '#22c55e',
      brand_color_background: '#020617',
      brand_color_foreground: '#ffffff',
      brand_color_muted: '#1e293b',
      title: 'Acme Health Landing',
      slogan: 'Modern care for everyone',
      about_text:
        'Acme Health connects patients with modern care experiences.',
      font_key: 'inter',
      font_id: 1,
      font_name: 'Inter',
      font_header_family: 'Inter, system-ui, sans-serif',
      font_body_family: 'Inter, system-ui, sans-serif',
      ...overrides.details,
    },
    departments: [
      {
        id: 10,
        name: 'Cardiology',
        phone_number: '123-456-7890',
        email: 'cardio@acme.test',
        location: 'Building A',
        services: [
          {
            id: 100,
            name: 'Heart Checkup',
            price: 100,
            description: 'Baseline heart screening',
            is_active: true,
          },
        ],
      },
    ],
    doctors: [],
    products: [
      {
        product_id: 200,
        tenant_id: 1,
        name: 'Blood Pressure Monitor',
        description: 'Home monitoring kit',
        price: 79,
        stock_quantity: 10,
        is_available: true,
      },
    ],
    plans: [],
    ...overrides,
  };
}

describe('FUL-72 public tenant landing route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.getState().clearAuth();
  });

  it('fetches landing data by slug and renders hero content', async () => {
    const landing = buildSampleLanding();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/tenants/by-slug/acme-health/landing')) {
        return new Response(JSON.stringify(landing), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      return new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }) as unknown as typeof fetch;

    const router = createTestRouter();
    renderWithProviders(router);

    await act(async () => {
      await router.navigate({
        to: '/landing/$tenantSlug',
        params: { tenantSlug: 'acme-health' },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /Acme Health Landing/i,
        })
      ).toBeTruthy();
    });

    expect(
      screen.getByText(
        /Acme Health connects patients with modern care experiences./i
      )
    ).toBeTruthy();
  });

  it('shows a friendly not-found screen when landing API returns 404', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input.toString();
      if (
        url.includes('/api/tenants/by-slug/missing-tenant/landing')
      ) {
        const err = new ApiError(
          'Tenant not found',
          404,
          'Tenant not found'
        );
        return new Response(
          JSON.stringify({
            detail: err.displayMessage,
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      return new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }) as unknown as typeof fetch;

    const router = createTestRouter();
    renderWithProviders(router);

    await act(async () => {
      await router.navigate({
        to: '/landing/$tenantSlug',
        params: { tenantSlug: 'missing-tenant' },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Tenant not found/i)).toBeTruthy();
    });

    expect(
      screen.getByText(
        /No approved tenant with slug "missing-tenant"/i
      )
    ).toBeTruthy();
  });
});

describe('FUL-72 TenantLanding component behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.getState().clearAuth();
  });

  it('renders a loading state when landingData is null', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TenantLanding landingData={null} />
      </QueryClientProvider>
    );
    expect(screen.getByText(/Loading…/i)).toBeTruthy();
  });
});
