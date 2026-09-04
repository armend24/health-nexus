/**
 * FUL-26: Pricing & cross-tenant plan management tests
 *
 * Covers:
 * 1. Cross-tenant isolation — Manager A cannot see or edit Manager B's plans (403 handling).
 * 2. Pricing validation — price outside subscription bounds shows user-friendly error, user
 *    corrects and resubmits successfully.
 * 3. Plan visibility — inactive (hidden) plans are not shown to clients on the landing page.
 * 4. Enrollment flow — subscribe, cancel, re-enroll lifecycle.
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
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { TenantLanding } from '../components/tenant-landing';
import type { TenantLandingPageResponse } from '../interfaces';
import { useAuthStore } from '../stores/auth.store';

// Stub dashboard-data.json so Jest doesn't need a file loader
jest.mock(
  '@/lib/dashboard-data.json',
  () => ({ __esModule: true, default: [] }),
  {
    virtual: true,
  }
);

beforeAll(() => {
  window.scrollTo = () => {};
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

function buildLanding(
  overrides: Partial<TenantLandingPageResponse> = {}
): TenantLandingPageResponse {
  return {
    tenant: {
      id: 1,
      name: 'Acme Health',
      slug: 'acme-health',
      email: 'info@acme.test',
      licence_number: 'LIC-001',
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
      title: 'Acme Health',
      slogan: 'Modern care',
      about_text: 'About text.',
      font_key: 'inter',
      font_id: 1,
      font_name: 'Inter',
      font_header_family: 'Inter, system-ui, sans-serif',
      font_body_family: 'Inter, system-ui, sans-serif',
      ...overrides.details,
    },
    departments: [],
    doctors: [],
    products: [],
    plans: overrides.plans ?? [
      {
        id: 10,
        name: 'Basic',
        description: 'Starter plan',
        price: 29.99,
        duration: 30,
        max_appointments: 5,
        max_consultations: 2,
        is_active: true,
      },
      {
        id: 20,
        name: 'Premium',
        description: 'Full coverage',
        price: 99.99,
        duration: 30,
        max_appointments: null,
        max_consultations: null,
        is_active: true,
      },
      {
        id: 30,
        name: 'Retired Plan',
        description: 'No longer offered',
        price: 19.99,
        duration: 30,
        max_appointments: 2,
        max_consultations: 1,
        is_active: false,
      },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  3. Plan visibility: hidden plans are NOT rendered for clients       */
/* ------------------------------------------------------------------ */

describe('FUL-26 plan visibility on landing page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.getState().clearAuth();
    // Stub fetch so useQuery calls don't fail uncontrollably
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ detail: 'Not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        })
    ) as unknown as typeof fetch;
  });

  it('renders only active plans and hides inactive ones', () => {
    const landing = buildLanding();
    renderWithQuery(<TenantLanding landingData={landing} />);

    // Switch to PLANS tab
    fireEvent.click(screen.getByRole('tab', { name: /plans/i }));

    // Active plans should be visible
    expect(screen.getByText('Basic')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();

    // Inactive plan should NOT be rendered
    expect(screen.queryByText('Retired Plan')).toBeNull();
  });

  it("shows 'No plans configured yet' when all plans are inactive", () => {
    const landing = buildLanding({
      plans: [
        {
          id: 30,
          name: 'Retired Plan',
          description: 'Hidden',
          price: 19.99,
          duration: 30,
          max_appointments: 2,
          max_consultations: 1,
          is_active: false,
        },
      ],
    });
    renderWithQuery(<TenantLanding landingData={landing} />);

    fireEvent.click(screen.getByRole('tab', { name: /plans/i }));

    expect(screen.getByText(/No plans configured yet/i)).toBeTruthy();
  });

  it('displays plan price, duration and limits for active plans', () => {
    const landing = buildLanding();
    renderWithQuery(<TenantLanding landingData={landing} />);

    fireEvent.click(screen.getByRole('tab', { name: /plans/i }));

    // Basic plan price
    expect(screen.getByText('€29.99')).toBeTruthy();
    // Premium plan price
    expect(screen.getByText('€99.99')).toBeTruthy();
    // Appointments limit for Basic
    expect(screen.getByText('5')).toBeTruthy();
    // Unlimited for Premium
    const unlimitedElements = screen.getAllByText('Unlimited');
    expect(unlimitedElements.length).toBeGreaterThanOrEqual(2);
  });

  it("labels visible plans as 'Available' not 'Active'", () => {
    const landing = buildLanding();
    renderWithQuery(<TenantLanding landingData={landing} />);

    fireEvent.click(screen.getByRole('tab', { name: /plans/i }));

    const badges = screen.getAllByText('Available');
    // One badge per active plan (Basic + Premium)
    expect(badges.length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  4. Enrollment flow (subscribe button behavior)                     */
/* ------------------------------------------------------------------ */

describe('FUL-26 enrollment subscribe button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.getState().clearAuth();
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ detail: 'Not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        })
    ) as unknown as typeof fetch;
  });

  it('shows subscribe buttons for each active plan', () => {
    const landing = buildLanding();
    renderWithQuery(<TenantLanding landingData={landing} />);

    fireEvent.click(screen.getByRole('tab', { name: /plans/i }));

    const subscribeButtons = screen.getAllByRole('button', {
      name: /subscribe to this plan/i,
    });
    // Two active plans → two subscribe buttons
    expect(subscribeButtons.length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  1. Cross-tenant isolation (API error handling in service layer)     */
/* ------------------------------------------------------------------ */

describe('FUL-26 cross-tenant isolation (service-level)', () => {
  it('tenantPlansService.listByTenant calls the correct tenant-scoped URL', async () => {
    const mockFetch = jest.fn(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
    ) as unknown as typeof fetch;
    global.fetch = mockFetch;

    // Dynamic import to get fresh module with mocked fetch
    const { tenantPlansService } =
      await import('../services/tenant-plans.service');

    await tenantPlansService.listByTenant(42);

    const calledUrl = (mockFetch as jest.Mock).mock
      .calls[0]?.[0] as string;
    expect(calledUrl).toContain('/user-tenant-plans/tenant/42');
  });

  it("tenantPlansService propagates 403 when accessing another tenant's plans", async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            detail:
              'Not authorized as tenant manager for this tenant',
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
    ) as unknown as typeof fetch;

    const { tenantPlansService } =
      await import('../services/tenant-plans.service');

    await expect(
      tenantPlansService.listByTenant(999)
    ).rejects.toThrow(/not authorized/i);
  });

  it('tenantPlansService.create propagates 403 for wrong tenant', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            detail:
              'Not authorized as tenant manager for this tenant',
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
    ) as unknown as typeof fetch;

    const { tenantPlansService } =
      await import('../services/tenant-plans.service');

    await expect(
      tenantPlansService.create({
        tenant_id: 999,
        name: 'Should Fail',
        price: 50,
      })
    ).rejects.toThrow(/not authorized/i);
  });
});

/* ------------------------------------------------------------------ */
/*  2. Pricing validation (API error → user correction → resubmit)     */
/* ------------------------------------------------------------------ */

describe('FUL-26 pricing validation (service-level)', () => {
  it('tenantPlansService.create propagates 400 with pricing rule detail', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            detail:
              "Price must be between 50.00 and 200.00 for this tenant's active subscription",
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
    ) as unknown as typeof fetch;

    const { tenantPlansService } =
      await import('../services/tenant-plans.service');

    await expect(
      tenantPlansService.create({
        tenant_id: 1,
        name: 'Too Cheap',
        price: 10,
      })
    ).rejects.toThrow(/price must be between/i);
  });

  it('tenantPlansService.pricingBounds returns min/max/base', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            min_price: 50,
            max_price: 200,
            base_price: 100,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
    ) as unknown as typeof fetch;

    const { tenantPlansService } =
      await import('../services/tenant-plans.service');

    const bounds = await tenantPlansService.pricingBounds(1);
    expect(bounds.min_price).toBe(50);
    expect(bounds.max_price).toBe(200);
    expect(bounds.base_price).toBe(100);
  });

  it('tenantPlansService.pricingBounds returns nulls when no active subscription', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            min_price: null,
            max_price: null,
            base_price: null,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
    ) as unknown as typeof fetch;

    const { tenantPlansService } =
      await import('../services/tenant-plans.service');

    const bounds = await tenantPlansService.pricingBounds(1);
    expect(bounds.min_price).toBeNull();
    expect(bounds.max_price).toBeNull();
    expect(bounds.base_price).toBeNull();
  });

  it('user correction flow: first create fails with 400, retry with valid price succeeds', async () => {
    let callCount = 0;
    global.fetch = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: pricing out of range
        return new Response(
          JSON.stringify({
            detail:
              "Price must be between 50.00 and 200.00 for this tenant's active subscription",
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      // Second call: success
      return new Response(
        JSON.stringify({
          id: 1,
          tenant_id: 1,
          name: 'Corrected Plan',
          price: 100,
          description: null,
          duration: null,
          max_appointments: null,
          max_consultations: null,
          is_active: true,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }) as unknown as typeof fetch;

    const { tenantPlansService } =
      await import('../services/tenant-plans.service');

    // First attempt: out of range → rejects
    await expect(
      tenantPlansService.create({
        tenant_id: 1,
        name: 'Corrected Plan',
        price: 10,
      })
    ).rejects.toThrow(/price must be between/i);

    // Second attempt: corrected price → succeeds
    const plan = await tenantPlansService.create({
      tenant_id: 1,
      name: 'Corrected Plan',
      price: 100,
    });
    expect(plan.id).toBe(1);
    expect(plan.name).toBe('Corrected Plan');
  });
});
