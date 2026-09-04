/**
 * Login route: email/password form, session-expired/revoked messaging, redirect when already authenticated.
 * beforeLoad: if authenticated, redirect to /dashboard or /tenants based on DASHBOARD_HOME access (rbacMatrix).
 */
import { FormField } from '@/components/atoms/form-field';
import { PasswordField } from '@/components/atoms/password-field';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiError } from '@/lib/api-client';
import { can, type Role } from '@/lib/rbac';
import { useAuthStore } from '@/stores/auth.store';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

/** Default post-login path: dashboard if user can access DASHBOARD_HOME, otherwise tenant selector. */
function getDefaultPostLoginPath(role: Role | undefined): string {
  return can({ role: role ?? undefined }, 'DASHBOARD_HOME')
    ? '/dashboard'
    : '/tenants';
}

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const { ensureAuth, isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) await ensureAuth();
    const state = useAuthStore.getState();
    if (state.isAuthenticated) {
      const to = getDefaultPostLoginPath(state.role);
      throw redirect({ to });
    }
  },
  /** Parses ?reason=expired|revoked and ?redirect= for post-login redirect. */
  validateSearch: (search: Record<string, unknown>) => {
    const reason =
      typeof search.reason === 'string' ? search.reason : undefined;
    const redirect =
      typeof search.redirect === 'string' &&
      search.redirect.startsWith('/') &&
      !search.redirect.startsWith('//')
        ? search.redirect
        : undefined;
    return { reason, redirect };
  },
  component: LoginPage,
});

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);
  const storeError = useAuthStore((s) => s.error);
  const { reason, redirect: redirectTo } = Route.useSearch();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const loginError = storeError ?? submitError;
  /** Shown when user was redirected with ?reason=expired or ?reason=revoked (e.g. after global 401 handler). */
  const reasonMessage =
    reason === 'expired'
      ? 'Session expired, please sign in again.'
      : reason === 'revoked'
        ? 'Session revoked, please sign in again.'
        : null;

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginValues) => {
    setSubmitError(null);
    try {
      await login(values);

      // Get updated state after login
      const state = useAuthStore.getState();
      const { role } = state;

      // If there's an explicit redirect param, use it
      if (
        redirectTo &&
        redirectTo.startsWith('/') &&
        !redirectTo.startsWith('//')
      ) {
        await navigate({
          to: redirectTo,
          replace: true,
        });
        return;
      }

      // Dashboard-capable roles use the standard path helper
      if (can({ role: role ?? undefined }, 'DASHBOARD_HOME')) {
        // Doctors land directly on their appointments management page
        if (role === 'DOCTOR') {
          await navigate({
            to: '/dashboard/appointments',
            replace: true,
          });
          return;
        }
        await navigate({
          to: '/dashboard',
          replace: true,
        });
        return;
      }

      // CLIENT / other roles without explicit redirect → tenant selector (dev-team default).
      // The /appointments/book flow is handled above via the ?redirect= param
      // that book.tsx's beforeLoad sets when redirecting unauthenticated users.
      await navigate({
        to: '/tenants',
        replace: true,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.displayMessage);
      } else {
        setSubmitError('Sign in failed');
      }
    }
  };

  const isSubmitting = status === 'loading';

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      data-testid="login-page"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Use your backend account credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reasonMessage ? (
            <div
              className="rounded-md border px-3 py-2 text-sm"
              data-testid="session-reason-message"
            >
              {reasonMessage}
            </div>
          ) : null}

          <form
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              error={form.formState.errors.email?.message}
              required
              {...form.register('email')}
            />

            <PasswordField
              id="password"
              label="Password"
              autoComplete="current-password"
              error={form.formState.errors.password?.message}
              required
              {...form.register('password')}
            />

            {loginError ? (
              <p className="text-sm text-destructive">{loginError}</p>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Sign in
            </Button>
          </form>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              Don&apos;t have an account?{' '}
              <Link
                to="/signup"
                className="underline underline-offset-4"
              >
                Register
              </Link>
            </p>
            <Link to="/" className="underline underline-offset-4">
              Back to home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
