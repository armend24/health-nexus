/**
 * Signup route: /signup
 * Allows new users to create a global account (role: client by default).
 * beforeLoad: if already authenticated, redirect to dashboard or tenants.
 * Uses the same form/component patterns as login.tsx.
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
import { authService } from '@/services/auth.service';
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
import { toast } from 'sonner';
import { z } from 'zod';

function getDefaultPostLoginPath(role: Role | undefined): string {
  return can({ role: role ?? undefined }, 'DASHBOARD_HOME')
    ? '/dashboard'
    : '/tenants';
}

export const Route = createFileRoute('/signup')({
  beforeLoad: async () => {
    const { ensureAuth, isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) await ensureAuth();
    const state = useAuthStore.getState();
    if (state.isAuthenticated) {
      const to = getDefaultPostLoginPath(state.role);
      throw redirect({ to });
    }
  },
  component: SignupPage,
});

const signupSchema = z
  .object({
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().min(1, 'Last name is required'),
    email: z.string().email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
      .regex(/\d/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type SignupValues = z.infer<typeof signupSchema>;

function SignupPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: SignupValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await authService.signup({
        email: values.email,
        password: values.password,
        first_name: values.first_name,
        last_name: values.last_name,
        role: 'client',
      });
      toast.success('Account created!', {
        description: 'You can now sign in with your new account.',
      });
      await navigate({
        to: '/login',
        search: {
          reason: undefined,
          redirect: undefined,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError('An account with this email already exists.');
      } else if (err instanceof ApiError) {
        setSubmitError(err.displayMessage);
      } else {
        setSubmitError('Sign up failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      data-testid="signup-page"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">
            Create an account
          </CardTitle>
          <CardDescription>
            Join Health Nexus as a patient to access tenant services.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                id="signup-first-name"
                label="First name"
                autoComplete="given-name"
                error={form.formState.errors.first_name?.message}
                required
                {...form.register('first_name')}
              />
              <FormField
                id="signup-last-name"
                label="Last name"
                autoComplete="family-name"
                error={form.formState.errors.last_name?.message}
                required
                {...form.register('last_name')}
              />
            </div>

            <FormField
              id="signup-email"
              label="Email"
              type="email"
              autoComplete="email"
              error={form.formState.errors.email?.message}
              required
              {...form.register('email')}
            />

            <PasswordField
              id="signup-password"
              label="Password"
              autoComplete="new-password"
              error={form.formState.errors.password?.message}
              required
              {...form.register('password')}
            />

            <PasswordField
              id="signup-confirm-password"
              label="Confirm password"
              autoComplete="new-password"
              error={form.formState.errors.confirmPassword?.message}
              required
              {...form.register('confirmPassword')}
            />

            {submitError ? (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Create account
            </Button>
          </form>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              Already have an account?{' '}
              <Link
                to="/login"
                search={{
                  reason: undefined,
                  redirect: undefined,
                }}
                className="underline underline-offset-4"
              >
                Sign in
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
