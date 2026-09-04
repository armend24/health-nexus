/**
 * FUL-Signup acceptance tests: sign-up form submission and error handling.
 *
 * Tests:
 * 1. Successful signup → navigates to /login with toast success.
 * 2. 409 conflict → inline "already exists" error, no redirect.
 * 3. Password mismatch → client-side validation error, no fetch.
 */
import {
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
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { clearTokens } from '../lib/api-client';
import { routeTree } from '../routeTree.gen';
import { useAuthStore } from '../stores/auth.store';

// stub dashboard-data.json so jest doesn't fail on JSON import
jest.mock(
  '@/lib/dashboard-data.json',
  () => ({ __esModule: true, default: [] }),
  {
    virtual: true,
  }
);

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

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  clearTokens();
  jest.clearAllMocks();
});

describe('FUL-Signup form', () => {
  it('navigates to /login after successful signup (201)', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/signup')) {
        return new Response(
          JSON.stringify({
            user_id: '99',
            email: 'new@test.com',
            role: 'client',
          }),
          {
            status: 201,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      // /auth/me → unauthenticated (so login page doesn't auto-redirect)
      return new Response(null, {
        status: 401,
      });
    }) as unknown as typeof fetch;

    const router = createTestRouter();
    renderWithProviders(router);

    await act(async () => {
      await router.navigate({ to: '/signup' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('signup-page')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: 'John' },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'secret1234' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'secret1234' },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /create account/i,
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeTruthy();
    });
  });

  it('shows inline error on 409 duplicate email without redirecting', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/signup')) {
        return new Response(
          JSON.stringify({
            detail: 'Email already registered',
          }),
          {
            status: 409,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      return new Response(null, {
        status: 401,
      });
    }) as unknown as typeof fetch;

    const router = createTestRouter();
    renderWithProviders(router);

    await act(async () => {
      await router.navigate({ to: '/signup' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('signup-page')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: 'John' },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'existing@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'secret1234' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'secret1234' },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /create account/i,
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(
        /An account with this email already exists/i
      );
    });

    // Should still be on signup page
    expect(screen.getByTestId('signup-page')).toBeTruthy();
  });

  it('shows client-side validation error on password mismatch without calling fetch', async () => {
    const mockFetch = jest.fn(
      async () => new Response('{}', { status: 200 })
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    const router = createTestRouter();
    renderWithProviders(router);

    await act(async () => {
      await router.navigate({ to: '/signup' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('signup-page')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: 'John' },
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'secret1234' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'differentpassword' },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /create account/i,
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(/passwords do not match/i)
      ).toBeTruthy();
    });

    // fetch should NOT have been called for signup
    const calls = (
      mockFetch.mock.calls as unknown as string[][]
    ).flat();
    const signupCalls = calls.filter((url) =>
      String(url).includes('/api/auth/signup')
    );
    expect(signupCalls.length).toBe(0);
  });
});
