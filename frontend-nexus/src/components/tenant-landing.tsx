/**
 * Public tenant landing with simple tabs:
 * HOME (hero/about) + DEPARTMENTS from API,
 * PRODUCTS / PLANS are placeholders for now.
 *
 * Used by /landing/$tenantSlug. Data from GET /api/tenants/by-slug/{slug}/landing.
 */
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import type { TenantLandingPageResponse } from '@/interfaces';
import { isApiError } from '@/lib/api-client';
import { resolveMediaUrl } from '@/lib/media-url';
import { getProductCategoryLabel } from '@/lib/product-categories';
import { can } from '@/lib/rbac';
import {
  clearCheckoutRecovery,
  loadCheckoutRecovery,
  saveCheckoutRecovery,
  type CheckoutRecoveryRecord,
} from '@/services/checkout-recovery.service';
import { checkoutService } from '@/services/checkout.service';
import { clientsService } from '@/services/clients.service';
import { patientsService } from '@/services/patients.service';
import { tenantPlansService } from '@/services/tenant-plans.service';
import { usersService } from '@/services/users.service';
import { useAuthStore } from '@/stores/auth.store';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Facebook,
  Instagram,
  Linkedin,
  MessageCircle,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PaymentFlowNotice } from './PaymentFlowNotice';
import { StripePaymentModal } from './StripePaymentModal';

export interface TenantLandingProps {
  /** Landing data from API; null while loading */
  landingData: TenantLandingPageResponse | null;
}

interface BrandStyles {
  headerStyle?: CSSProperties;
  bodyStyle?: CSSProperties;
  primary?: string | null;
  secondary?: string | null;
  background?: string | null;
  foreground?: string | null;
}

function buildBrandStyles(
  details: TenantLandingPageResponse['details']
): BrandStyles {
  return {
    headerStyle:
      details?.font_header_family != null
        ? {
            fontFamily: details.font_header_family,
          }
        : undefined,
    bodyStyle:
      details?.font_body_family != null
        ? { fontFamily: details.font_body_family }
        : undefined,
    primary: details?.brand_color_primary ?? null,
    secondary: details?.brand_color_secondary ?? null,
    background: details?.brand_color_background ?? null,
    foreground: details?.brand_color_foreground ?? null,
  };
}

const DEFAULT_TENANT_HERO_IMAGE =
  '/images/tenant-hero-placeholder.svg';

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const PAYMENT_CONFIRMATION_TIMEOUT_MS = 45_000;
const ENROLLMENT_CANCELLATION_NOTICE_KEY_PREFIX =
  'health-nexus.enrollment-cancellation-notice';
const CATEGORY_PREVIEW_LIMIT = 4;

function getEnrollmentCancellationNoticeStorageKey(
  tenantId: number
): string {
  return `${ENROLLMENT_CANCELLATION_NOTICE_KEY_PREFIX}.${tenantId}`;
}

function loadHandledEnrollmentCancellation(
  tenantId: number
): string | null {
  try {
    return (
      globalThis.localStorage?.getItem(
        getEnrollmentCancellationNoticeStorageKey(tenantId)
      ) ?? null
    );
  } catch {
    return null;
  }
}

function saveHandledEnrollmentCancellation(
  tenantId: number,
  cancellationKey: string
) {
  try {
    globalThis.localStorage?.setItem(
      getEnrollmentCancellationNoticeStorageKey(tenantId),
      cancellationKey
    );
  } catch {
    // ignore storage failures
  }
}

function clearHandledEnrollmentCancellation(tenantId: number) {
  try {
    globalThis.localStorage?.removeItem(
      getEnrollmentCancellationNoticeStorageKey(tenantId)
    );
  } catch {
    // ignore storage failures
  }
}

function formatCurrency(value: number): string {
  return usdFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatStatusTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Unavailable';
  return new Date(parsed).toLocaleString();
}

function getApiDetailCode(err: unknown): string | undefined {
  if (!isApiError(err) || !err.data || typeof err.data !== 'object')
    return undefined;
  const detail =
    'detail' in err.data
      ? (err.data as { detail?: unknown }).detail
      : undefined;
  if (!detail || typeof detail !== 'object') return undefined;
  const code =
    'code' in detail
      ? (detail as { code?: unknown }).code
      : undefined;
  return typeof code === 'string' ? code : undefined;
}

export function TenantLanding({ landingData }: TenantLandingProps) {
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [showCheckoutStatusModal, setShowCheckoutStatusModal] =
    useState(false);
  const [isCheckingCheckoutStatus, setIsCheckingCheckoutStatus] =
    useState(false);
  const [isCheckoutNoticeVisible, setIsCheckoutNoticeVisible] =
    useState(true);
  const [checkoutRecovery, setCheckoutRecovery] =
    useState<CheckoutRecoveryRecord | null>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(
    null
  );
  const [registeredOverride, setRegisteredOverride] = useState(false);
  const handledPaymentIdsRef = useRef<Set<number>>(new Set());
  const localEnrollmentCancellationRef = useRef(false);
  const handledEnrollmentCancellationRef = useRef<Set<string>>(
    new Set()
  );

  const user = useAuthStore((s) => s.user);
  const role = useAuthStore((s) => s.role);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { resolvedTheme } = useTheme();

  const tenantId = landingData?.tenant?.id;
  const stripeClientSecret = checkoutRecovery?.clientSecret ?? null;
  const pendingPlanId = checkoutRecovery?.planId ?? null;

  const queryClient = useQueryClient();

  function shouldShowEnrollmentCancellationToast(
    cancellationKey: string
  ): boolean {
    if (!tenantId) {
      return !handledEnrollmentCancellationRef.current.has(
        cancellationKey
      );
    }

    return (
      !handledEnrollmentCancellationRef.current.has(
        cancellationKey
      ) &&
      loadHandledEnrollmentCancellation(tenantId) !== cancellationKey
    );
  }

  function markEnrollmentCancellationHandled(
    cancellationKey: string
  ) {
    handledEnrollmentCancellationRef.current.add(cancellationKey);
    if (!tenantId) {
      return;
    }

    saveHandledEnrollmentCancellation(tenantId, cancellationKey);
  }

  function setEnrollmentCheckoutRecovery(
    next: CheckoutRecoveryRecord | null
  ) {
    if (!next) {
      clearCheckoutRecovery('enrollment');
      setCheckoutRecovery(null);
      return;
    }

    const saved = saveCheckoutRecovery(next);
    setCheckoutRecovery(saved);
  }

  function clearEnrollmentCheckout() {
    localEnrollmentCancellationRef.current = false;
    setShowStripeModal(false);
    setShowCheckoutStatusModal(false);
    setIsCheckoutNoticeVisible(true);
    setEnrollmentCheckoutRecovery(null);
  }

  function moveEnrollmentCheckoutToAttention() {
    if (!checkoutRecovery) return;
    setEnrollmentCheckoutRecovery({
      ...checkoutRecovery,
      clientSecret: null,
      phase: 'attention_required',
    });
  }

  // Hydrate the selected plan from the user's existing enrollment.
  // Only sync on initial fetch — not on every render — so the user
  // can click "Change plan" without it snapping back immediately.
  const shouldSyncEnrollmentState =
    isAuthenticated &&
    (selectedPlanId !== null || checkoutRecovery !== null);

  const enrollmentRefetchInterval = shouldSyncEnrollmentState
    ? checkoutRecovery?.phase === 'processing'
      ? 2500
      : 5000
    : false;

  const {
    data: enrollmentData,
    error: enrollmentError,
    isError: isEnrollmentError,
    refetch: refetchEnrollment,
  } = useQuery({
    queryKey: ['my-enrollment', tenantId],
    queryFn: () => tenantPlansService.myEnrollment(tenantId!),
    enabled: !!tenantId && isAuthenticated,
    retry: false,
    refetchInterval: enrollmentRefetchInterval,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!tenantId || !isAuthenticated) {
      setCheckoutRecovery(null);
      return;
    }

    const savedRecovery = loadCheckoutRecovery('enrollment');
    if (!savedRecovery) {
      setCheckoutRecovery(null);
      return;
    }

    if (savedRecovery.tenantId !== tenantId) {
      clearCheckoutRecovery('enrollment');
      setCheckoutRecovery(null);
      return;
    }

    setCheckoutRecovery(savedRecovery);
    setIsCheckoutNoticeVisible(true);
    setActiveTab('plans');
  }, [tenantId, isAuthenticated]);

  useEffect(() => {
    if (
      enrollmentData?.user_tenant_plan_id &&
      enrollmentData.status === 'ACTIVE'
    ) {
      localEnrollmentCancellationRef.current = false;
      if (tenantId) {
        clearHandledEnrollmentCancellation(tenantId);
      }
      setSelectedPlanId(enrollmentData.user_tenant_plan_id);
    }
  }, [enrollmentData, tenantId]);

  useEffect(() => {
    if (!checkoutRecovery || !enrollmentData) return;

    const isRecoveredActivation =
      enrollmentData.status === 'ACTIVE' &&
      enrollmentData.user_tenant_plan_id === checkoutRecovery.planId;

    if (!isRecoveredActivation) return;

    setSelectedPlanId(checkoutRecovery.planId);
    setShowStripeModal(false);
    clearCheckoutRecovery('enrollment');
    setCheckoutRecovery(null);

    if (
      !handledPaymentIdsRef.current.has(checkoutRecovery.paymentId)
    ) {
      handledPaymentIdsRef.current.add(checkoutRecovery.paymentId);
      toast.success('Payment confirmed. Your plan is now active.');
    }
  }, [checkoutRecovery, enrollmentData]);

  useEffect(() => {
    if (!enrollmentData || enrollmentData.status !== 'CANCELLED') {
      return;
    }

    const hasEnrollmentUiState =
      selectedPlanId !== null || checkoutRecovery !== null;
    if (!hasEnrollmentUiState) {
      return;
    }

    const cancellationKey = `${enrollmentData.id}:${enrollmentData.cancelled_at ?? 'cancelled'}`;
    const shouldShowToast =
      shouldShowEnrollmentCancellationToast(cancellationKey);
    markEnrollmentCancellationHandled(cancellationKey);

    setSelectedPlanId(null);

    if (localEnrollmentCancellationRef.current) {
      return;
    }

    clearEnrollmentCheckout();
    if (shouldShowToast) {
      toast.error('Enrollment cancelled.', {
        description: 'You can choose a plan again anytime.',
      });
    }
  }, [checkoutRecovery, enrollmentData, selectedPlanId]);

  useEffect(() => {
    const isMissingEnrollment =
      isEnrollmentError &&
      isApiError(enrollmentError) &&
      enrollmentError.status === 404;

    if (!isMissingEnrollment) {
      return;
    }

    const hasEnrollmentUiState =
      selectedPlanId !== null || checkoutRecovery !== null;
    if (!hasEnrollmentUiState) {
      return;
    }

    const cancellationKey = `missing:${tenantId ?? 'unknown'}`;
    const shouldShowToast =
      shouldShowEnrollmentCancellationToast(cancellationKey);
    markEnrollmentCancellationHandled(cancellationKey);

    setSelectedPlanId(null);

    if (localEnrollmentCancellationRef.current) {
      return;
    }

    clearEnrollmentCheckout();
    if (shouldShowToast) {
      toast.error('Enrollment cancelled.', {
        description:
          'Your enrollment is no longer active. You can choose a plan again anytime.',
      });
    }
  }, [
    checkoutRecovery,
    enrollmentError,
    isEnrollmentError,
    selectedPlanId,
  ]);

  useEffect(() => {
    if (checkoutRecovery?.phase !== 'processing') return;

    const startedAt = Date.parse(checkoutRecovery.startedAt);
    if (Number.isNaN(startedAt)) {
      moveEnrollmentCheckoutToAttention();
      return;
    }

    const remainingMs =
      PAYMENT_CONFIRMATION_TIMEOUT_MS - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      moveEnrollmentCheckoutToAttention();
      return;
    }

    const timer = window.setTimeout(() => {
      moveEnrollmentCheckoutToAttention();
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [checkoutRecovery]);

  useEffect(() => {
    if (!checkoutRecovery) {
      setIsCheckoutNoticeVisible(true);
      return;
    }

    setIsCheckoutNoticeVisible(true);
  }, [checkoutRecovery?.paymentId, checkoutRecovery?.phase]);

  async function handleCheckEnrollmentStatus() {
    setShowCheckoutStatusModal(true);
    if (!tenantId) return;

    setIsCheckingCheckoutStatus(true);
    try {
      await queryClient.invalidateQueries({
        queryKey: ['my-enrollment', tenantId],
      });
      await refetchEnrollment();
    } finally {
      setIsCheckingCheckoutStatus(false);
    }
  }

  async function handleEnrollmentPaymentFailure(
    errorMessage: string
  ) {
    if (!tenantId) {
      toast.error(errorMessage);
      return;
    }

    localEnrollmentCancellationRef.current = true;

    try {
      await tenantPlansService.cancelEnrollment(tenantId);
      await queryClient.invalidateQueries({
        queryKey: ['my-enrollment', tenantId],
      });
      setSelectedPlanId(null);
      if (checkoutRecovery) {
        setEnrollmentCheckoutRecovery({
          ...checkoutRecovery,
          phase: 'attention_required',
        });
      }
    } catch (err) {
      toast.error(
        'Payment failed and the enrollment rollback did not complete.',
        {
          description: isApiError(err)
            ? err.displayMessage
            : errorMessage,
        }
      );
      localEnrollmentCancellationRef.current = false;
    }
  }

  async function handleEnrollmentCheckoutCancelled() {
    if (!tenantId) {
      clearEnrollmentCheckout();
      return;
    }

    localEnrollmentCancellationRef.current = true;

    try {
      await tenantPlansService.cancelEnrollment(tenantId);
      await queryClient.invalidateQueries({
        queryKey: ['my-enrollment', tenantId],
      });
      setSelectedPlanId(null);
      clearEnrollmentCheckout();
      toast.message('Checkout cancelled.');
    } catch (err) {
      clearEnrollmentCheckout();
      toast.error(
        'Checkout was closed, but the pending enrollment was not cancelled.',
        {
          description: isApiError(err)
            ? err.displayMessage
            : 'Please refresh and try again.',
        }
      );
      localEnrollmentCancellationRef.current = false;
    }
  }

  const enrollMutation = useMutation({
    mutationFn: async ({
      tenantId,
      planId,
      price,
    }: {
      tenantId: number;
      planId: number;
      price: number;
    }) => {
      localEnrollmentCancellationRef.current = false;

      // 1. Enroll
      const enrollment = await tenantPlansService.enroll(
        tenantId,
        planId
      );
      queryClient.setQueryData(
        ['my-enrollment', tenantId],
        enrollment
      );

      if (price <= 0) {
        return { enrollment, planId, requiresPayment: false };
      }
      // 2. Initiate Stripe checkout
      const idempotencyKey = crypto.randomUUID();
      const checkout = await checkoutService.initiate(
        { enrollment_id: enrollment.id },
        idempotencyKey
      );
      setEnrollmentCheckoutRecovery({
        kind: 'enrollment',
        tenantId,
        planId,
        paymentId: checkout.payment_id,
        referenceId: enrollment.id,
        phase: 'collecting_payment',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clientSecret: checkout.stripe_client_secret,
      });
      setShowStripeModal(true);
      return { enrollment, planId, requiresPayment: true };
    },
    onSuccess: async (data) => {
      if (data.requiresPayment) {
        return;
      }

      clearEnrollmentCheckout();
      setSelectedPlanId(data.planId);
      await queryClient.invalidateQueries({
        queryKey: ['my-enrollment', tenantId],
      });
      toast.success('Free plan activated successfully.');
    },
    onError: (err) => {
      clearEnrollmentCheckout();
      toast.error(
        isApiError(err)
          ? err.message
          : 'Failed to subscribe. Please try again.'
      );
    },
  });

  const authEmail = user?.email?.trim() ?? '';
  const meQuery = useQuery({
    queryKey: ['users-me-register-email'],
    queryFn: usersService.getMe,
    enabled: isAuthenticated && !authEmail,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const registerEmail =
    authEmail || meQuery.data?.email?.trim() || '';
  const registrationStatusQuery = useQuery({
    queryKey: ['tenant-patient-registration', tenantId, user?.id],
    queryFn: () => patientsService.getMyTenantProfile(tenantId!),
    enabled: !!tenantId && isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    setRegisteredOverride(false);
  }, [tenantId, isAuthenticated, user?.id]);

  const registrationStatusError = registrationStatusQuery.error;
  const isRegistrationStatusExpectedNotRegistered =
    isApiError(registrationStatusError) &&
    (registrationStatusError.status === 403 ||
      registrationStatusError.status === 404);
  const hasUnexpectedRegistrationStatusError =
    registrationStatusQuery.isError &&
    !isRegistrationStatusExpectedNotRegistered;
  const isRegistered =
    registeredOverride || registrationStatusQuery.isSuccess;
  const isRegistrationCheckPending =
    isAuthenticated &&
    !!tenantId &&
    registrationStatusQuery.isLoading &&
    !registeredOverride;

  const registerMutation = useMutation({
    mutationFn: ({
      tenantId,
      email,
    }: {
      tenantId: number;
      email: string;
    }) =>
      clientsService.registerAsPatient(tenantId, {
        email,
      }),
    onSuccess: () => {
      toast.success('Registered');
      setRegisteredOverride(true);
    },
    onError: (err) => {
      if (
        isApiError(err) &&
        err.status === 409 &&
        getApiDetailCode(err) === 'EMAIL_ALREADY_REGISTERED'
      ) {
        toast.success('Already registered');
        setRegisteredOverride(true);
        return;
      }
      if (isApiError(err) && err.status === 403) {
        toast.error('Access denied');
        return;
      }
      if (isApiError(err) && err.status === 404) {
        toast.error('Tenant not found');
        return;
      }
      toast.error('Registration failed', {
        description: isApiError(err)
          ? err.displayMessage
          : 'Please try again.',
      });
    },
  });

  const handleRegisterAsPatient = () => {
    if (!tenantId) return;
    if (!registerEmail) {
      toast.error(
        'Unable to determine your email. Please try again.'
      );
      return;
    }
    registerMutation.mutate({
      tenantId,
      email: registerEmail,
    });
  };

  // Cancel enrollment so tenant manager sees "no active plan"
  const cancelMutation = useMutation({
    mutationFn: (tid: number) =>
      tenantPlansService.cancelEnrollment(tid),
    onMutate: () => {
      localEnrollmentCancellationRef.current = true;
    },
    onSuccess: () => {
      setSelectedPlanId(null);
      queryClient.invalidateQueries({
        queryKey: ['my-enrollment', tenantId],
      });
      toast.success('Plan cancelled', {
        description: 'You can pick a new plan below.',
      });
    },
    onError: (err) => {
      localEnrollmentCancellationRef.current = false;
      toast.error(
        isApiError(err)
          ? err.message
          : 'Failed to cancel. Please try again.'
      );
    },
  });
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const canOpenTenantDashboard = can({ role }, 'DASHBOARD_TENANT');

  const handleLogout = async () => {
    await logout();
    navigate({
      to: '/login',
      search: {
        reason: undefined,
        redirect: undefined,
      },
      replace: true,
    });
  };

  const handleGoToTenantDashboard = () => {
    navigate({
      to: '/dashboard/tenant/$section',
      params: { section: 'departments-services' },
    });
  };

  const userInitial = (
    user?.email?.trim().charAt(0) ||
    user?.fullName?.trim().charAt(0) ||
    'U'
  ).toUpperCase();
  const availableProducts = (landingData?.products ?? []).filter(
    (product) => product.is_available !== false
  );
  const groupedProducts = useMemo(() => {
    const groups = new Map<
      string,
      {
        categoryLabel: string;
        categoryValue?: string;
        items: typeof availableProducts;
      }
    >();
    for (const product of availableProducts) {
      const categoryValue = product.category?.trim().toLowerCase();
      const categoryLabel =
        getProductCategoryLabel(product.category) ||
        'Uncategorized';
      const key = categoryValue ?? `uncategorized:${categoryLabel}`;
      const existingGroup = groups.get(key);
      if (existingGroup) {
        existingGroup.items.push(product);
      } else {
        groups.set(key, {
          categoryLabel,
          categoryValue,
          items: [product],
        });
      }
    }

    return Array.from(groups.values())
      .sort((left, right) =>
        left.categoryLabel.localeCompare(right.categoryLabel)
      )
      .map((group) => ({
        category: group.categoryLabel,
        categoryValue: group.categoryValue,
        items: [...group.items].sort((left, right) =>
          left.name.localeCompare(right.name)
        ),
      }));
  }, [availableProducts]);

  if (!landingData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  const { tenant, details, departments } = landingData;
  const plans = (landingData.plans ?? []).filter(
    (p) => p.is_active !== false
  );
  const title = details?.title ?? tenant.name;
  const subtitle = details?.slogan ?? 'Welcome to our landing page.';
  const logo = resolveMediaUrl(details?.logo);
  const heroImage =
    resolveMediaUrl(details?.image) || DEFAULT_TENANT_HERO_IMAGE;
  const moto = details?.moto ?? 'Your health, our priority.';
  const about = details?.about_text ?? 'No description available.';
  const slug = tenant.slug ?? '';
  const brand = buildBrandStyles(details);
  const fontHeaderStyle = brand.headerStyle;
  const fontBodyStyle = brand.bodyStyle;
  const featuredDepartments = departments.slice(0, 3);
  const handleOpenShop = (category?: string) => {
    if (!tenantId) return;
    useAuthStore.setState({ tenantId: String(tenantId) });
    void navigate({
      to: '/dashboard/shop',
      search: category ? { category } : {},
    });
  };
  const handleGoToProfile = () => {
    if (tenantId) {
      useAuthStore.setState({ tenantId: String(tenantId) });
    }
    void navigate({
      to: '/dashboard/profile',
    });
  };
  const serviceCount = departments.reduce(
    (total, department) => total + department.services.length,
    0
  );
  const pendingPlan = checkoutRecovery
    ? plans.find((plan) => plan.id === checkoutRecovery.planId)
    : null;
  const checkoutStatusTitle =
    checkoutRecovery?.phase === 'processing'
      ? 'Payment confirmation in progress'
      : checkoutRecovery?.phase === 'attention_required'
        ? 'Payment needs attention'
        : 'Checkout status';
  const checkoutStatusDescription =
    checkoutRecovery?.phase === 'processing'
      ? 'We are still waiting for the backend to confirm activation for this payment.'
      : checkoutRecovery?.phase === 'attention_required'
        ? 'This payment is still pending after the expected confirmation window. You can refresh the status or clear it and retry.'
        : 'Review the current state of this pending payment.';
  const accountButtonStyle: CSSProperties | undefined = brand.primary
    ? {
        backgroundColor: brand.primary,
        borderColor: brand.primary,
        color: brand.foreground ?? '#ffffff',
      }
    : brand.secondary
      ? {
          borderColor: brand.secondary,
          color: brand.secondary,
        }
      : undefined;
  const primaryButtonStyle: CSSProperties | undefined = brand.primary
    ? {
        backgroundColor: brand.primary,
        borderColor: brand.primary,
        color: '#ffffff',
      }
    : undefined;
  const heroPanelStyle: CSSProperties | undefined =
    brand.primary || brand.background
      ? {
          background: `linear-gradient(135deg, ${
            resolvedTheme === 'dark'
              ? 'rgba(2,6,23,0.82)'
              : (brand.background ?? 'rgba(255,255,255,0.9)')
          } 0%, ${
            resolvedTheme === 'dark'
              ? brand.primary
                ? `color-mix(in srgb, ${brand.primary} 16%, transparent)`
                : 'rgba(59,130,246,0.18)'
              : (brand.primary ?? 'rgba(59,130,246,0.12)')
          } 100%)`,
        }
      : undefined;

  return (
    <div>
      <div className="flex h-10 items-center justify-center bg-gradient-to-r from-white via-blue-100/70 to-blue-100/90  transition dark:from-[#131c33] dark:via-[#243661] dark:to-[#234586] dark:shadow-lg border-b-zinc-500">
        <div className="container px-6 flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link
              to="/tenants"
              className="flex items-center text-sm font-semibold tracking-wide text-blue-900 transition hover:opacity-90 hover:underline dark:text-white"
              style={{ letterSpacing: '0.05em' }}
            >
              <span className=" mr-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-100/80 text-blue-700 shadow dark:bg-gradient-to-br dark:from-blue-500/60 dark:to-blue-900/60 dark:text-blue-100">
                <ArrowLeft className="h-3 w-3" />
              </span>
              Tenants List
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {[
              {
                href: 'https://wa.me',
                title: 'WhatsApp',
                icon: MessageCircle,
                color: 'text-emerald-600 dark:text-emerald-300',
              },
              {
                href: 'https://instagram.com',
                title: 'Instagram',
                icon: Instagram,
                color: 'text-pink-600 dark:text-pink-300',
              },
              {
                href: 'https://facebook.com',
                title: 'Facebook',
                icon: Facebook,
                color: 'text-blue-700 dark:text-blue-200',
              },
              {
                href: 'https://linkedin.com',
                title: 'LinkedIn',
                icon: Linkedin,
                color: 'text-blue-800 dark:text-blue-300',
              },
            ].map(({ href, title, icon: Icon, color }) => (
              <a
                key={title}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
                className="rounded-full p-1 transition hover:scale-110 hover:bg-blue-200/60 dark:hover:bg-blue-900/50"
              >
                <Icon className={`h-5 w-5 ${color}`} />
              </a>
            ))}
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="relative flex min-h-screen flex-col overflow-hidden"
        style={fontBodyStyle}
      >
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div
            className={`
            absolute inset-0 
            bg-gradient-to-br
            from-[#e6edf7] via-[#dbeafe] to-[#b1c4e6]
            dark:from-[#1d2333] dark:via-[#1c2130] dark:to-[#375483]
            -rotate-6 
            scale-200
            z-[-1]
          `}
          />
        </div>

        <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              {logo ? (
                <img
                  src={logo}
                  alt={title}
                  className="h-9 w-9 rounded-lg object-contain"
                />
              ) : (
                <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold">
                  {title
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-semibold sm:text-base">
                  {title}
                </span>
                <span className="text-xs text-muted-foreground sm:text-[0.8rem]">
                  {subtitle}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <TabsList
                variant="line"
                className="inline-flex items-center gap-1 rounded-lg p-0.75"
              >
                <TabsTrigger value="home">HOME</TabsTrigger>
                <TabsTrigger value="departments">
                  DEPARTMENTS
                </TabsTrigger>
                <TabsTrigger value="products">PRODUCTS</TabsTrigger>
                <TabsTrigger value="plans">PLANS</TabsTrigger>
              </TabsList>
              <ThemeToggle
                variant="outline"
                size="icon-sm"
                className="rounded-full"
              />
              {isAuthenticated && user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="rounded-full text-xs text-white! font-semibold"
                      aria-label="Open account menu"
                      title={user.email}
                      style={accountButtonStyle}
                    >
                      {userInitial}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="min-w-40"
                  >
                    <DropdownMenuLabel className="text-xs sm:text-sm">
                      Signed in as
                      <br />
                      <span className="font-medium">
                        {user.email}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {canOpenTenantDashboard ? (
                      <>
                        <DropdownMenuItem
                          onClick={handleGoToTenantDashboard}
                        >
                          Go to dashboard
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    ) : null}
                    <DropdownMenuItem onClick={handleLogout}>
                      <span className="text-destructive">
                        Log out
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
        </header>

        <main className="container mx-auto flex-1 px-4 py-6 sm:px-6 sm:py-10">
          <div className="flex flex-1 flex-col gap-6">
            <TabsContent value="home" className="mt-0 flex-1">
              <section className="mx-auto container">
                <div
                  className="relative overflow-hidden rounded-[2rem] border border-white/40 bg-card/80 px-6 py-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur dark:border-zinc-200/20 dark:bg-slate-950/55 dark:shadow-[0_30px_80px_-40px_rgba(2,6,23,0.9)] sm:px-8 sm:py-10 lg:px-10 lg:py-12"
                  style={heroPanelStyle}
                >
                  <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-white/35 via-white/10 to-transparent dark:from-cyan-400/10 dark:via-sky-300/5 dark:to-transparent lg:block" />
                  <div className="pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-white/25 blur-3xl dark:bg-cyan-300/10" />
                  <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-white/20 blur-3xl dark:bg-blue-400/10" />

                  <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-center">
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className="inline-flex rounded-full border border-white/50 bg-white/70 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-foreground/80 shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/70 dark:text-slate-100"
                            style={
                              brand.secondary
                                ? { color: brand.secondary }
                                : undefined
                            }
                          >
                            {moto}
                          </span>
                          <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-300/80">
                            {subtitle}
                          </span>
                        </div>

                        <div className="space-y-4">
                          <h1
                            className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
                            style={fontHeaderStyle}
                          >
                            {title}
                          </h1>
                          <p className="max-w-2xl text-base leading-7 text-muted-foreground dark:text-slate-300 sm:text-lg">
                            {about}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button
                          size="sm"
                          className="min-w-36 shadow-sm"
                          onClick={() => setActiveTab('departments')}
                          style={primaryButtonStyle}
                        >
                          Explore departments
                        </Button>

                        {isAuthenticated && user ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-w-36 bg-background/70 dark:border-zinc-200/20 dark:bg-slate-900/70 dark:text-slate-100"
                            disabled={
                              isRegistered ||
                              registerMutation.isPending ||
                              meQuery.isLoading ||
                              isRegistrationCheckPending
                            }
                            loading={registerMutation.isPending}
                            onClick={handleRegisterAsPatient}
                          >
                            {isRegistered
                              ? 'Already registered'
                              : isRegistrationCheckPending
                                ? 'Checking...'
                                : 'Register as patient'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-w-36 bg-background/70 dark:border-zinc-200/20 dark:bg-slate-900/70 dark:text-slate-100"
                            onClick={() =>
                              navigate({
                                to: '/login',
                                search: {
                                  reason: undefined,
                                  redirect: `/landing/${slug || tenant.id}`,
                                },
                              })
                            }
                          >
                            Sign in to register
                          </Button>
                        )}
                      </div>

                      {isAuthenticated && user && isRegistered ? (
                        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/65">
                          <p className="text-muted-foreground dark:text-slate-300">
                            You&apos;re registered. Complete your
                            patient details from your profile.
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleGoToProfile}
                          >
                            Go to Profile
                          </Button>
                        </div>
                      ) : null}

                      {hasUnexpectedRegistrationStatusError ? (
                        <p className="text-sm text-destructive">
                          Unable to verify registration status right
                          now.
                        </p>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border bg-background/70 p-4 shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/65">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">
                            Departments
                          </p>
                          <p className="mt-2 text-2xl font-semibold">
                            {departments.length}
                          </p>
                        </div>
                        <div className="rounded-2xl border bg-background/70 p-4 shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/65">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">
                            Services
                          </p>
                          <p className="mt-2 text-2xl font-semibold">
                            {serviceCount}
                          </p>
                        </div>
                        <div className="rounded-2xl border bg-background/70 p-4 shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/65">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">
                            Plans
                          </p>
                          <p className="mt-2 text-2xl font-semibold">
                            {plans.length}
                          </p>
                        </div>
                      </div>

                      {featuredDepartments.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-slate-400">
                            Popular care areas
                          </p>
                          <ul className="flex flex-wrap gap-2">
                            {featuredDepartments.map((d) => (
                              <li
                                key={d.id}
                                className="rounded-full border bg-background/70 px-3 py-1.5 text-sm text-foreground/80 shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/65 dark:text-slate-100"
                              >
                                {d.name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <aside className="relative">
                      <div className="overflow-hidden rounded-[1.75rem] border border-white/50 bg-background/85 p-3 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.6)] backdrop-blur dark:border-zinc-200/20 dark:bg-slate-950/70 dark:shadow-[0_24px_60px_-32px_rgba(2,6,23,0.95)]">
                        <div className="relative h-[260px] overflow-hidden rounded-[1.25rem] bg-muted/40 dark:bg-slate-900/70 sm:h-[320px]">
                          <>
                            <img
                              src={heroImage}
                              alt={title}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-900/10 to-transparent" />
                          </>

                          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                            <div className="flex items-center gap-3">
                              {logo ? (
                                <img
                                  src={logo}
                                  alt={title}
                                  className="h-12 w-12 rounded-xl bg-white/90 p-1 object-contain"
                                />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/85 text-sm font-semibold text-slate-900">
                                  {title
                                    .split(' ')
                                    .map((p) => p[0])
                                    .join('')
                                    .slice(0, 2)}
                                </div>
                              )}
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                                  Welcome
                                </p>
                                <p
                                  className="text-lg font-semibold"
                                  style={fontHeaderStyle}
                                >
                                  {title}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 p-4 sm:grid-cols-2">
                          <div className="rounded-2xl border bg-card/70 p-4 dark:border-zinc-200/20 dark:bg-slate-900/70">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">
                              Tenant
                            </p>
                            <code className="mt-2 inline-flex rounded bg-muted px-2 py-1 text-xs dark:bg-slate-800 dark:text-slate-100">
                              {slug || tenant.name}
                            </code>
                          </div>
                          <div className="rounded-2xl border bg-card/70 p-4 dark:border-zinc-200/20 dark:bg-slate-900/70">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">
                              Products
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground dark:text-slate-300">
                              {availableProducts.length} available for
                              this tenant.
                            </p>
                          </div>
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="departments" className="mt-0 flex-1">
              <section className="mx-auto container space-y-6">
                <div className="overflow-hidden rounded-[2rem] border border-white/40 bg-card/75 p-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur dark:border-zinc-200/20 dark:bg-slate-950/55 dark:shadow-[0_24px_60px_-36px_rgba(2,6,23,0.9)] sm:p-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl space-y-3">
                      <p
                        className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground dark:text-slate-400"
                        style={
                          brand.secondary
                            ? { color: brand.secondary }
                            : undefined
                        }
                      >
                        Care directory
                      </p>
                      <h2
                        className="text-2xl font-semibold tracking-tight sm:text-3xl"
                        style={fontHeaderStyle}
                      >
                        Departments & services
                      </h2>
                      <p className="text-sm leading-6 text-muted-foreground dark:text-slate-300 sm:text-base">
                        {departments.length > 0
                          ? 'Browse the main departments, discover available services, and find the best point of care for your visit.'
                          : 'No departments configured yet.'}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border bg-background/70 px-4 py-3 shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/65">
                        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">
                          Departments
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {departments.length}
                        </p>
                      </div>
                      <div className="rounded-2xl border bg-background/70 px-4 py-3 shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/65">
                        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">
                          Services
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {serviceCount}
                        </p>
                      </div>
                      <div className="rounded-2xl border bg-background/70 px-4 py-3 shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/65">
                        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400">
                          Featured
                        </p>
                        <p className="mt-2 text-sm font-medium text-foreground/80 dark:text-slate-100">
                          {featuredDepartments[0]?.name ??
                            'Coming soon'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {departments.length > 0 ? (
                  <div className="grid gap-5 lg:grid-cols-2">
                    {departments.map((dept, index) => {
                      return (
                        <article
                          key={dept.id}
                          className="group relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border bg-card/80 p-5  transition duration-300 hover:-translate-y-1  dark:border-zinc-200/20 dark:bg-slate-950/65  sm:p-6"
                        >
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-24  opacity-80 dark:from-cyan-300/10 dark:to-transparent" />

                          <div className="relative flex items-start justify-between gap-4">
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-background/80 text-sm font-semibold shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/80"
                                  style={
                                    brand.primary
                                      ? {
                                          borderColor:
                                            resolvedTheme === 'dark'
                                              ? 'rgba(226,232,240,0.22)'
                                              : `${brand.primary}55`,
                                          color: 'white',
                                        }
                                      : undefined
                                  }
                                >
                                  {String(index + 1).padStart(2, '0')}
                                </div>
                                <div>
                                  <h3 className="text-lg font-semibold sm:text-xl">
                                    {dept.name}
                                  </h3>
                                  {dept.location ? (
                                    <p className="text-sm text-muted-foreground dark:text-slate-300">
                                      {dept.location}
                                    </p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border bg-background/70 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground dark:border-zinc-200/20 dark:bg-slate-900/70 dark:text-slate-300">
                                  {dept.services.length} service
                                  {dept.services.length === 1
                                    ? ''
                                    : 's'}
                                </span>
                                {dept.phone_number ? (
                                  <span className="rounded-full border bg-background/70 px-3 py-1 text-[0.7rem] text-muted-foreground dark:border-zinc-200/20 dark:bg-slate-900/70 dark:text-slate-300">
                                    {dept.phone_number}
                                  </span>
                                ) : null}
                                {dept.email ? (
                                  <span className="rounded-full border bg-background/70 px-3 py-1 text-[0.7rem] text-muted-foreground dark:border-zinc-200/20 dark:bg-slate-900/70 dark:text-slate-300">
                                    {dept.email}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="relative mt-5 flex flex-wrap gap-2">
                            {dept.services.length > 0 ? (
                              dept.services.map((service) => (
                                <span
                                  key={service.id}
                                  className="rounded-full border bg-background/75 px-3 py-1.5 text-xs font-medium shadow-sm dark:border-zinc-200/20 dark:bg-slate-900/75 dark:text-slate-100"
                                  style={
                                    brand.primary
                                      ? {
                                          borderColor:
                                            resolvedTheme === 'dark'
                                              ? 'rgba(226,232,240,0.22)'
                                              : `${brand.primary}55`,
                                          color: brand.primary,
                                        }
                                      : undefined
                                  }
                                >
                                  {service.name}
                                </span>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground dark:text-slate-300">
                                No services listed.
                              </p>
                            )}
                          </div>

                          {dept.services.some(
                            (s) => s.description
                          ) ? (
                            <div className="relative mt-5 rounded-2xl border bg-background/65 p-4 dark:border-zinc-200/20 dark:bg-slate-900/65">
                              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-slate-400">
                                Service highlights
                              </p>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-slate-300">
                                {dept.services
                                  .filter((s) => s.description)
                                  .slice(0, 2)
                                  .map((s) => s.description)
                                  .join(' • ')}
                              </p>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[1.75rem] border bg-card/70 p-10 text-center shadow-sm dark:border-zinc-200/20 dark:bg-slate-950/60">
                    <p className="text-base font-medium">
                      No departments configured yet.
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground dark:text-slate-300">
                      Department information will appear here once
                      this tenant adds care areas and services.
                    </p>
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent value="products" className="mt-0 flex-1">
              <section className="mx-auto max-w-5xl space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                      Products
                    </h2>
                    <p className="text-sm text-muted-foreground sm:text-base">
                      {availableProducts.length > 0
                        ? 'Healthcare products currently available from this tenant.'
                        : 'No products available yet.'}
                    </p>
                  </div>
                  {isAuthenticated && role === 'CLIENT' ? (
                    <Button onClick={() => handleOpenShop()}>
                      Open Shop
                    </Button>
                  ) : null}
                </div>
                {groupedProducts.length > 0 ? (
                  <div className="space-y-6">
                    {groupedProducts.map((group) => (
                      <section
                        key={group.category}
                        className="space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">
                              {group.category}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {group.items.length} product
                              {group.items.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          {group.items.length > CATEGORY_PREVIEW_LIMIT &&
                          isAuthenticated &&
                          role === 'CLIENT' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleOpenShop(group.categoryValue)
                              }
                            >
                              Open in Shop
                            </Button>
                          ) : null}
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          {group.items
                            .slice(0, CATEGORY_PREVIEW_LIMIT)
                            .map((product) => (
                            <article
                              key={product.product_id}
                              className="flex h-full flex-col rounded-xl border bg-card/60 p-4 shadow-sm"
                            >
                              <div className="flex gap-4">
                                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                                  {product.image_url ? (
                                    <img
                                      src={
                                        resolveMediaUrl(
                                          product.image_url
                                        ) ?? ''
                                      }
                                      alt={product.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      No image
                                    </span>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <h4 className="text-sm font-semibold sm:text-base">
                                        {product.name}
                                      </h4>
                                      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                                        {group.category}
                                      </p>
                                    </div>
                                    <span
                                      className="rounded-full border px-2 py-0.5 text-xs font-medium"
                                      style={
                                        brand.primary
                                          ? {
                                              borderColor:
                                                brand.primary,
                                              color: brand.primary,
                                            }
                                          : undefined
                                      }
                                    >
                                      {formatCurrency(product.price)}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    {product.description ||
                                      'No description provided.'}
                                  </p>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                        {group.items.length > CATEGORY_PREVIEW_LIMIT ? (
                          <p className="text-sm text-muted-foreground">
                            Showing {CATEGORY_PREVIEW_LIMIT} of{' '}
                            {group.items.length} products in this
                            category.
                          </p>
                        ) : null}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card/60 p-6 text-center text-sm text-muted-foreground">
                    No products configured yet.
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent value="plans" className="mt-0 flex-1">
              <section className="mx-auto container space-y-6">
                <div className="overflow-hidden rounded-[2rem] border border-white/40 bg-card/75 p-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl space-y-3">
                      <p
                        className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground"
                        style={
                          brand.secondary
                            ? { color: brand.secondary }
                            : undefined
                        }
                      >
                        Membership plans
                      </p>
                      <h2
                        className="text-2xl font-semibold tracking-tight sm:text-3xl"
                        style={fontHeaderStyle}
                      >
                        Plans &amp; memberships
                      </h2>
                      <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                        {plans.length > 0
                          ? 'Choose the plan that fits your care needs, compare limits, and subscribe directly from this page.'
                          : 'No plans available yet.'}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border bg-background/70 px-4 py-3 shadow-sm">
                        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                          Available
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {plans.length}
                        </p>
                      </div>
                      <div className="rounded-2xl border bg-background/70 px-4 py-3 shadow-sm">
                        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                          Starting at
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {plans.length > 0
                            ? `€${Math.min(
                                ...plans.map((plan) =>
                                  Number(plan.price)
                                )
                              ).toFixed(2)}`
                            : '€0.00'}
                        </p>
                      </div>
                      <div className="rounded-2xl border bg-background/70 px-4 py-3 shadow-sm">
                        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                          Active plan
                        </p>
                        <p className="mt-2 text-sm font-medium text-foreground/80">
                          {plans.find((p) => p.id === selectedPlanId)
                            ?.name ?? 'None selected'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {checkoutRecovery && isCheckoutNoticeVisible ? (
                  <PaymentFlowNotice
                    phase={checkoutRecovery.phase}
                    eyebrow="Plan checkout"
                    title={
                      checkoutRecovery.phase === 'collecting_payment'
                        ? 'Your secure checkout is ready'
                        : checkoutRecovery.phase === 'processing'
                          ? 'We are confirming your payment'
                          : 'Payment submitted, but activation is still pending'
                    }
                    description={
                      checkoutRecovery.phase === 'collecting_payment'
                        ? 'Return to the Stripe form to finish your payment. Your current selection will stay pending until you submit the card details.'
                        : checkoutRecovery.phase === 'processing'
                          ? 'Stripe accepted your submission. This page will keep checking for plan activation and update automatically once the backend confirms it.'
                          : 'We have not confirmed activation yet. You can check again now, or clear this pending checkout and start over if you need to retry.'
                    }
                    primaryAction={{
                      label:
                        checkoutRecovery.phase ===
                        'collecting_payment'
                          ? 'Resume checkout'
                          : 'Check status now',
                      onClick: async () => {
                        if (
                          checkoutRecovery.phase ===
                          'collecting_payment'
                        ) {
                          setShowStripeModal(true);
                          setActiveTab('plans');
                          return;
                        }

                        await handleCheckEnrollmentStatus();
                      },
                    }}
                    secondaryAction={{
                      label:
                        checkoutRecovery.phase ===
                        'attention_required'
                          ? 'Clear pending checkout'
                          : 'Close notice',
                      onClick: () => {
                        if (
                          checkoutRecovery.phase ===
                          'attention_required'
                        ) {
                          clearEnrollmentCheckout();
                          return;
                        }

                        setShowStripeModal(false);
                        setIsCheckoutNoticeVisible(false);
                      },
                      variant: 'outline',
                    }}
                  />
                ) : null}

                {checkoutRecovery && !isCheckoutNoticeVisible ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        Plan checkout is still pending
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Reopen the notice, resume checkout, or review
                        the current status.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setIsCheckoutNoticeVisible(true)
                        }
                      >
                        Open notice
                      </Button>
                      <Button
                        onClick={async () => {
                          if (
                            checkoutRecovery.phase ===
                            'collecting_payment'
                          ) {
                            setShowStripeModal(true);
                            setActiveTab('plans');
                            return;
                          }

                          await handleCheckEnrollmentStatus();
                        }}
                      >
                        {checkoutRecovery.phase ===
                        'collecting_payment'
                          ? 'Open checkout'
                          : 'Check status'}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <Dialog
                  open={showCheckoutStatusModal && !!checkoutRecovery}
                  onOpenChange={setShowCheckoutStatusModal}
                >
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{checkoutStatusTitle}</DialogTitle>
                      <DialogDescription>
                        {checkoutStatusDescription}
                      </DialogDescription>
                    </DialogHeader>

                    {checkoutRecovery ? (
                      <div className="space-y-3">
                        <div className="rounded-lg border bg-muted/30 p-4">
                          <div className="grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                              <p className="text-muted-foreground">
                                Plan
                              </p>
                              <p className="font-medium">
                                {pendingPlan?.name ?? 'Pending plan'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Payment ID
                              </p>
                              <p className="font-medium">
                                #{checkoutRecovery.paymentId}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Enrollment ID
                              </p>
                              <p className="font-medium">
                                #{checkoutRecovery.referenceId}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Current phase
                              </p>
                              <p className="font-medium capitalize">
                                {checkoutRecovery.phase.replaceAll(
                                  '_',
                                  ' '
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Started
                              </p>
                              <p className="font-medium">
                                {formatStatusTimestamp(
                                  checkoutRecovery.startedAt
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Last updated
                              </p>
                              <p className="font-medium">
                                {formatStatusTimestamp(
                                  checkoutRecovery.updatedAt
                                )}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/70 bg-card/70 p-4 text-sm text-muted-foreground">
                          {checkoutRecovery.phase === 'processing'
                            ? 'Stripe accepted your payment submission. Activation will finish once the backend confirms the enrollment update.'
                            : 'The payment has not been confirmed yet. If this status does not change after another refresh, clear the pending checkout and try again.'}
                        </div>
                      </div>
                    ) : null}

                    <DialogFooter>
                      {checkoutRecovery?.phase ===
                      'attention_required' ? (
                        <Button
                          variant="outline"
                          onClick={clearEnrollmentCheckout}
                        >
                          Clear pending checkout
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() =>
                          setShowCheckoutStatusModal(false)
                        }
                      >
                        Close
                      </Button>
                      <Button
                        onClick={handleCheckEnrollmentStatus}
                        loading={isCheckingCheckoutStatus}
                      >
                        Refresh status
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {selectedPlanId &&
                  (() => {
                    const selected = plans.find(
                      (p) => p.id === selectedPlanId
                    );
                    if (!selected) return null;

                    return (
                      <div
                        className="flex flex-col gap-4 rounded-[1.75rem] border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                        style={{
                          borderColor: brand.primary ?? undefined,
                          background: `linear-gradient(135deg, ${
                            brand.primary ?? '#2563eb'
                          }14 0%, rgba(255,255,255,0.9) 100%)`,
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white text-base font-bold shadow-sm"
                            style={{
                              backgroundColor:
                                brand.primary ?? '#2563eb',
                            }}
                          >
                            ✓
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Your current plan
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                              {selected.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              €{Number(selected.price).toFixed(2)}
                              {selected.duration
                                ? ` / ${selected.duration} days`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="sm:min-w-32"
                          disabled={cancelMutation.isPending}
                          onClick={() => {
                            if (tenantId)
                              cancelMutation.mutate(tenantId);
                          }}
                        >
                          {cancelMutation.isPending
                            ? 'Cancelling…'
                            : 'Change plan'}
                        </Button>
                      </div>
                    );
                  })()}

                {plans.length > 0 ? (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {plans.map((plan, index) => {
                      const isSelected = selectedPlanId === plan.id;
                      const isLockedByActiveEnrollment =
                        enrollmentData?.status === 'ACTIVE' &&
                        enrollmentData.user_tenant_plan_id !==
                          plan.id;
                      const isCheckoutPending =
                        enrollMutation.isPending &&
                        pendingPlanId === plan.id;
                      const isRecoveryLocked =
                        !!checkoutRecovery &&
                        checkoutRecovery.phase !==
                          'attention_required';
                      const isFreePlan = Number(plan.price) <= 0;
                      const featureItems = [
                        {
                          label: 'Appointments',
                          value:
                            plan.max_appointments != null
                              ? String(plan.max_appointments)
                              : 'Unlimited',
                        },
                        {
                          label: 'Consultations',
                          value:
                            plan.max_consultations != null
                              ? String(plan.max_consultations)
                              : 'Unlimited',
                        },
                        {
                          label: 'Billing cycle',
                          value: plan.duration
                            ? `${plan.duration} day${
                                plan.duration !== 1 ? 's' : ''
                              }`
                            : 'Flexible',
                        },
                      ];

                      return (
                        <article
                          key={plan.id}
                          className={`relative flex h-full flex-col overflow-hidden rounded-[1.85rem] border bg-card/85 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.7)] ${
                            isSelected ? 'ring-2' : ''
                          }`}
                          style={
                            isSelected
                              ? {
                                  borderColor:
                                    brand.primary ?? undefined,
                                  outlineColor:
                                    brand.primary ?? undefined,
                                  boxShadow: `0 0 0 1px ${
                                    brand.primary ?? '#2563eb'
                                  }`,
                                }
                              : brand.primary
                                ? {
                                    borderColor: `${brand.primary}33`,
                                  }
                                : undefined
                          }
                        >
                          <div
                            className="relative px-5 py-5 sm:px-6"
                            style={{
                              background: `linear-gradient(135deg, ${
                                brand.primary ?? '#2563eb'
                              }18 0%, ${
                                brand.secondary ?? '#0f172a'
                              }10 100%)`,
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-2">
                                <div
                                  className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-background/80 text-sm font-semibold shadow-sm"
                                  style={
                                    brand.primary
                                      ? {
                                          borderColor: `${brand.primary}55`,
                                          color: brand.primary,
                                        }
                                      : undefined
                                  }
                                >
                                  {String(index + 1).padStart(2, '0')}
                                </div>
                                <div>
                                  <h3 className="text-xl font-semibold">
                                    {plan.name}
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    {plan.duration
                                      ? `${plan.duration} day${
                                          plan.duration !== 1
                                            ? 's'
                                            : ''
                                        } access`
                                      : 'Flexible duration'}
                                  </p>
                                </div>
                              </div>
                              <span
                                className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] shadow-sm"
                                style={
                                  isSelected
                                    ? {
                                        borderColor:
                                          brand.primary ?? undefined,
                                        color:
                                          brand.primary ?? undefined,
                                      }
                                    : undefined
                                }
                              >
                                {isSelected ? 'Active' : 'Available'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-1 flex-col p-5 sm:p-6">
                            <div className="flex items-end justify-between gap-3">
                              <div>
                                <p className="text-4xl font-bold tracking-tight">
                                  €{Number(plan.price).toFixed(2)}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                  {plan.duration
                                    ? `Per ${plan.duration} day${
                                        plan.duration !== 1 ? 's' : ''
                                      }`
                                    : 'Custom period'}
                                </p>
                              </div>
                            </div>

                            <p className="mt-4 min-h-16 text-sm leading-6 text-muted-foreground">
                              {plan.description ||
                                'A structured care membership tailored for ongoing access and recurring support.'}
                            </p>

                            <div className="mt-5 space-y-3 rounded-2xl border bg-background/65 p-4">
                              {featureItems.map((item) => (
                                <div
                                  key={item.label}
                                  className="flex items-center justify-between gap-4 text-sm"
                                >
                                  <span className="text-muted-foreground">
                                    {item.label}
                                  </span>
                                  <span className="font-medium">
                                    {item.value}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="mt-5 rounded-2xl border bg-background/50 px-4 py-3">
                              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Ideal for
                              </p>
                              <p className="mt-2 text-sm text-muted-foreground">
                                {plan.max_consultations == null &&
                                plan.max_appointments == null
                                  ? 'Patients who want broad, ongoing access without strict limits.'
                                  : 'Patients who want clearer usage limits and predictable coverage.'}
                              </p>
                            </div>

                            <Button
                              size="sm"
                              className="mt-5 w-full"
                              variant={
                                isSelected ? 'outline' : 'default'
                              }
                              disabled={
                                isSelected ||
                                isLockedByActiveEnrollment ||
                                enrollMutation.isPending ||
                                isRecoveryLocked
                              }
                              style={
                                isSelected
                                  ? {
                                      borderColor:
                                        brand.primary ?? undefined,
                                      color:
                                        brand.primary ?? undefined,
                                    }
                                  : primaryButtonStyle
                              }
                              onClick={() => {
                                if (!isAuthenticated) {
                                  toast.error(
                                    'Please log in to subscribe to a plan.'
                                  );
                                  return;
                                }
                                enrollMutation.mutate({
                                  tenantId: tenant.id,
                                  planId: plan.id,
                                  price: Number(plan.price),
                                });
                              }}
                            >
                              {isSelected
                                ? 'You have selected this plan'
                                : isLockedByActiveEnrollment
                                  ? 'Unavailable until current plan expires'
                                  : isCheckoutPending
                                    ? isFreePlan
                                      ? 'Activating free plan…'
                                      : 'Redirecting to payment…'
                                    : isFreePlan
                                      ? 'Choose this free plan'
                                      : 'Subscribe to this plan'}
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[1.75rem] border bg-card/70 p-10 text-center shadow-sm">
                    <p className="text-base font-medium">
                      No plans configured yet.
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Membership options will appear here once this
                      tenant publishes plan pricing and coverage.
                    </p>
                  </div>
                )}

                <StripePaymentModal
                  clientSecret={stripeClientSecret ?? ''}
                  open={showStripeModal && !!stripeClientSecret}
                  onClose={async () => {
                    if (
                      checkoutRecovery?.phase === 'collecting_payment'
                    ) {
                      await handleEnrollmentCheckoutCancelled();
                      return;
                    }

                    if (
                      checkoutRecovery?.phase === 'attention_required'
                    ) {
                      clearEnrollmentCheckout();
                      return;
                    }

                    setShowStripeModal(false);
                  }}
                  onPaymentConfirmed={async () => {
                    if (!checkoutRecovery) return;

                    setShowStripeModal(false);
                    setEnrollmentCheckoutRecovery({
                      ...checkoutRecovery,
                      clientSecret: null,
                      phase: 'processing',
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ['my-enrollment', tenantId],
                    });
                  }}
                  onPaymentFailed={async (errorMessage) => {
                    await handleEnrollmentPaymentFailure(
                      errorMessage
                    );
                  }}
                />
              </section>
            </TabsContent>
          </div>
        </main>
      </Tabs>
    </div>
  );
}
