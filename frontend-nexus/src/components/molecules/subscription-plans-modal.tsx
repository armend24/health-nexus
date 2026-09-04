import { PlanCard } from '@/components/molecules/plan-card';
import { PaymentFlowNotice } from '@/components/PaymentFlowNotice';
import { StripePaymentModal } from '@/components/StripePaymentModal';
import { isApiError } from '@/lib/api-client';
import { TENANT_SUBSCRIPTION_UPDATED_EVENT } from '@/lib/tenant-subscription-events';
import {
  clearCheckoutRecovery,
  loadCheckoutRecovery,
  saveCheckoutRecovery,
  type CheckoutRecoveryRecord,
} from '@/services/checkout-recovery.service';
import { checkoutService } from '@/services/checkout.service';
import {
  changePlan,
  getCurrentSubscription,
  getSubscriptionPlans,
  getSubscriptionRequest,
  getSubscriptionStats,
  type SubscriptionPlan,
  type SubscriptionStats,
  type TenantSubscription,
  type TenantSubscriptionRequest,
} from '@/services/subscription-plans.service';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface SubscriptionPlansModalProps {
  onClose: () => void;
}

const PAYMENT_CONFIRMATION_TIMEOUT_MS = 45_000;
const NO_ACTIVE_SUBSCRIPTION_MESSAGE =
  'No active subscription found for this tenant';

/**
 * SubscriptionPlansModal Component
 * Displays all available subscription plans and highlights the user's current plan.
 * Users can see which plan they're subscribed to and explore upgrade/downgrade options.
 */
export function SubscriptionPlansModal({}: SubscriptionPlansModalProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] =
    useState<TenantSubscription | null>(null);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingPlanId, setChangingPlanId] = useState<number | null>(
    null
  );
  const [changeError, setChangeError] = useState<string | null>(null);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [checkoutRecovery, setCheckoutRecovery] =
    useState<CheckoutRecoveryRecord | null>(null);
  const [pendingRequest, setPendingRequest] =
    useState<TenantSubscriptionRequest | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(
    null
  );
  const handledPaymentIdsRef = useRef<Set<number>>(new Set());
  const stripeClientSecret = checkoutRecovery?.clientSecret ?? null;

  async function getCurrentSubscriptionOrNull() {
    try {
      return await getCurrentSubscription();
    } catch (err) {
      if (
        isApiError(err) &&
        err.status === 404 &&
        err.displayMessage === NO_ACTIVE_SUBSCRIPTION_MESSAGE
      ) {
        return null;
      }

      throw err;
    }
  }

  function buildStatusFeedback(
    request: TenantSubscriptionRequest
  ): string {
    const paymentStatus =
      request.latest_payment_status ?? 'NO_PAYMENT';

    if (request.admin_status === 'ACTIVE') {
      return 'Your plan request has been approved and the subscription is active.';
    }

    if (request.admin_status === 'CANCELLED') {
      return (
        request.cancellation_reason ??
        'This subscription request was cancelled by a super admin.'
      );
    }

    if (paymentStatus === 'CAPTURED') {
      return 'Payment received. Your request is waiting for super admin approval.';
    }

    if (paymentStatus === 'AUTHORIZED') {
      return 'Payment is authorized and still being finalized with Stripe.';
    }

    if (paymentStatus === 'INITIATED') {
      return 'Checkout exists, but payment capture has not been confirmed yet.';
    }

    if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELED') {
      return `Payment status is ${paymentStatus}. You may need to retry checkout.`;
    }

    return `Current payment status: ${paymentStatus}.`;
  }

  function setSubscriptionCheckoutRecovery(
    next: CheckoutRecoveryRecord | null
  ) {
    if (!next) {
      clearCheckoutRecovery('tenant-subscription');
      setCheckoutRecovery(null);
      return;
    }

    const saved = saveCheckoutRecovery(next);
    setCheckoutRecovery(saved);
  }

  function clearSubscriptionCheckout() {
    setShowStripeModal(false);
    setSubscriptionCheckoutRecovery(null);
  }

  function moveSubscriptionCheckoutToAttention() {
    if (!checkoutRecovery) return;
    setSubscriptionCheckoutRecovery({
      ...checkoutRecovery,
      clientSecret: null,
      phase: 'attention_required',
    });
  }

  function moveSubscriptionCheckoutToAwaitingApproval() {
    if (!checkoutRecovery) return;
    setSubscriptionCheckoutRecovery({
      ...checkoutRecovery,
      clientSecret: null,
      phase: 'awaiting_approval',
    });
  }

  const refreshSubscriptionData = async (
    expectedPlanId?: number,
    maxAttempts = 6
  ) => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const [updatedSubscription, updatedStats] = await Promise.all([
        getCurrentSubscriptionOrNull(),
        getSubscriptionStats(),
      ]);

      setCurrentSubscription(updatedSubscription);
      setStats(updatedStats);

      if (
        expectedPlanId === undefined ||
        updatedSubscription?.subscription_plan_id === expectedPlanId
      ) {
        return updatedSubscription;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return null;
  };

  const refreshSubscriptionRequest = async (
    subscriptionId: number
  ) => {
    const request = await getSubscriptionRequest(subscriptionId);
    setPendingRequest(request);
    setStatusFeedback(buildStatusFeedback(request));

    if (
      request.admin_status === 'PENDING' &&
      request.latest_payment_status === 'CAPTURED' &&
      checkoutRecovery?.phase === 'processing'
    ) {
      moveSubscriptionCheckoutToAwaitingApproval();
    }

    if (request.admin_status === 'ACTIVE') {
      await refreshSubscriptionData(request.subscription_plan_id, 2);
    } else {
      await refreshSubscriptionData();
    }

    return request;
  };

  const handleCheckStatus = async () => {
    if (!checkoutRecovery) return;

    setIsCheckingStatus(true);
    try {
      if (checkoutRecovery.phase === 'processing') {
        await checkoutService.syncStatus(checkoutRecovery.paymentId);
      }

      const request = await refreshSubscriptionRequest(
        checkoutRecovery.referenceId
      );
      const feedback = buildStatusFeedback(request);
      setStatusFeedback(feedback);
      toast.message('Subscription status updated.', {
        description: feedback,
      });
    } catch (err) {
      const message =
        isApiError(err) || err instanceof Error
          ? err.message
          : 'Unable to refresh subscription status.';
      setStatusFeedback(message);
      toast.error('Unable to check subscription status.', {
        description: isApiError(err) ? err.displayMessage : message,
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    const savedRecovery = loadCheckoutRecovery('tenant-subscription');
    if (!savedRecovery) {
      setCheckoutRecovery(null);
      return;
    }

    setCheckoutRecovery(savedRecovery);
  }, []);

  useEffect(() => {
    if (!checkoutRecovery || !currentSubscription) return;

    const hasRecoveredActivePlan =
      currentSubscription.status === 'ACTIVE' &&
      currentSubscription.subscription_plan_id ===
        checkoutRecovery.planId;

    if (!hasRecoveredActivePlan) return;

    clearSubscriptionCheckout();
    setPendingRequest(null);
    setStatusFeedback(null);
  }, [checkoutRecovery, currentSubscription]);

  // Helper: Check if a plan can accommodate current stats
  const canPlanFitStats = (plan: SubscriptionPlan): boolean => {
    if (!stats) return true;

    const docsFit =
      plan.max_doctors === null ||
      stats.doctors_used <= plan.max_doctors;
    const patientsFit =
      plan.max_patients === null ||
      stats.patients_used <= plan.max_patients;
    const deptsFit =
      plan.max_departments === null ||
      stats.departments_used <= plan.max_departments;

    return docsFit && patientsFit && deptsFit;
  };

  // Helper: Find the recommended plan (smallest plan that fits current stats)
  const getRecommendedPlanId = (): number | null => {
    if (!stats) return null;

    // Filter plans that can fit the stats, then sort by total capacity and pick the smallest
    const fittingPlans = plans.filter(canPlanFitStats);
    if (fittingPlans.length === 0) return null;

    // Return the first fitting plan (they're already ordered from smallest to largest in the DB)
    return fittingPlans[0].id;
  };

  // Fetch both subscription plans and current subscription on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const results = await Promise.allSettled([
          getSubscriptionPlans(),
          getCurrentSubscriptionOrNull(),
          getSubscriptionStats(),
        ]);
        const plansData =
          results[0].status === 'fulfilled' ? results[0].value : [];
        const currentSub =
          results[1].status === 'fulfilled' ? results[1].value : null;
        const statsData =
          results[2].status === 'fulfilled' ? results[2].value : null;
        setPlans(plansData);
        setCurrentSubscription(currentSub);
        setStats(statsData);
      } catch (err) {
        let message = 'Failed to load plans';
        if (isApiError(err)) {
          message = err.displayMessage;
        } else if (err instanceof Error) {
          message = err.message;
        }
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const handleTenantSubscriptionUpdated = () => {
      void (async () => {
        try {
          const [updatedSubscription, updatedStats] =
            await Promise.all([
              getCurrentSubscriptionOrNull(),
              getSubscriptionStats(),
            ]);

          setCurrentSubscription(updatedSubscription);
          setStats(updatedStats);
          setPendingRequest(null);
          setStatusFeedback(null);

          if (!updatedSubscription) {
            clearSubscriptionCheckout();
          }
        } catch {
          // Keep the existing UI state when background refresh fails.
        }
      })();
    };

    window.addEventListener(
      TENANT_SUBSCRIPTION_UPDATED_EVENT,
      handleTenantSubscriptionUpdated
    );

    return () => {
      window.removeEventListener(
        TENANT_SUBSCRIPTION_UPDATED_EVENT,
        handleTenantSubscriptionUpdated
      );
    };
  }, [checkoutRecovery]);

  useEffect(() => {
    if (!checkoutRecovery || !pendingRequest) return;

    if (pendingRequest.id !== checkoutRecovery.referenceId) {
      return;
    }

    if (pendingRequest.admin_status === 'ACTIVE') {
      clearSubscriptionCheckout();
      setStatusFeedback(null);

      if (
        !handledPaymentIdsRef.current.has(checkoutRecovery.paymentId)
      ) {
        handledPaymentIdsRef.current.add(checkoutRecovery.paymentId);
        toast.success(
          'Subscription approved. Your new plan is now active.'
        );
      }
      return;
    }

    if (pendingRequest.admin_status === 'CANCELLED') {
      clearSubscriptionCheckout();
      toast.error('Subscription request was cancelled.', {
        description:
          pendingRequest.cancellation_reason ??
          'A super admin cancelled this pending plan change.',
      });
      setStatusFeedback(null);
    }
  }, [checkoutRecovery, pendingRequest]);

  useEffect(() => {
    if (checkoutRecovery?.phase !== 'processing') return;

    const startedAt = Date.parse(checkoutRecovery.startedAt);
    if (Number.isNaN(startedAt)) {
      moveSubscriptionCheckoutToAttention();
      return;
    }

    const remainingMs =
      PAYMENT_CONFIRMATION_TIMEOUT_MS - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      moveSubscriptionCheckoutToAttention();
      return;
    }

    const timer = window.setTimeout(() => {
      moveSubscriptionCheckoutToAttention();
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [checkoutRecovery]);

  useEffect(() => {
    if (
      checkoutRecovery?.phase !== 'processing' &&
      checkoutRecovery?.phase !== 'awaiting_approval' &&
      checkoutRecovery?.phase !== 'attention_required'
    ) {
      return;
    }

    const interval = window.setInterval(
      async () => {
        try {
          if (checkoutRecovery.phase === 'processing') {
            await checkoutService.syncStatus(
              checkoutRecovery.paymentId
            );
          }
          await refreshSubscriptionRequest(
            checkoutRecovery.referenceId
          );
        } catch {
          // Continue polling; webhook delivery may still settle the payment.
        }
      },
      checkoutRecovery.phase === 'processing' ? 2500 : 5000
    );

    return () => window.clearInterval(interval);
  }, [checkoutRecovery]);

  const handleChangePlan = async (planId: number) => {
    try {
      setPendingRequest(null);
      setStatusFeedback(null);

      if (
        checkoutRecovery &&
        currentSubscription?.status === 'ACTIVE' &&
        currentSubscription.subscription_plan_id ===
          checkoutRecovery.planId
      ) {
        clearSubscriptionCheckout();
        setPendingRequest(null);
        setStatusFeedback(null);
      }

      setChangingPlanId(planId);
      setChangeError(null);
      const selectedPlan = plans.find((plan) => plan.id === planId);
      if (!selectedPlan) {
        throw new Error('Selected plan not found');
      }

      const nextSubscription = await changePlan(planId);
      if (parseFloat(selectedPlan.price) <= 0) {
        clearSubscriptionCheckout();
        await refreshSubscriptionData();
        toast.success('Subscription updated successfully.');
        return;
      }

      const idempotencyKey = crypto.randomUUID();
      const checkout = await checkoutService.initiate(
        { tenant_subscription_id: nextSubscription.id },
        idempotencyKey
      );
      setSubscriptionCheckoutRecovery({
        kind: 'tenant-subscription',
        tenantId: nextSubscription.tenant_id,
        planId,
        paymentId: checkout.payment_id,
        referenceId: nextSubscription.id,
        phase: 'collecting_payment',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clientSecret: checkout.stripe_client_secret,
      });
      setStatusFeedback(null);
      setShowStripeModal(true);
    } catch (err) {
      clearSubscriptionCheckout();
      let message = 'Failed to change plan';
      if (isApiError(err)) {
        message = err.displayMessage;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setChangeError(message);
    } finally {
      setChangingPlanId(null);
    }
  };

  // Show loading state while fetching data
  if (loading) {
    return (
      <div className="w-full">
        <div className="text-center py-12">Loading plans...</div>
      </div>
    );
  }

  // Show error state if data fetch fails
  if (error) {
    return (
      <div className="w-full">
        <div className="text-center py-12 text-red-500">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 py-6">
      {/* Title */}
      <h1 className="text-4xl font-bold text-center mb-4 dark:text-white text-gray-900">
        Choose Your Health Nexus Plan
      </h1>

      {/* Thin stats summary line */}
      {stats && (
        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          Currently registered:{' '}
          <span className="font-semibold text-gray-900 dark:text-white">
            {stats.doctors_used} doctor
            {stats.doctors_used !== 1 ? 's' : ''}
          </span>
          ,{' '}
          <span className="font-semibold text-gray-900 dark:text-white">
            {stats.patients_used} patient
            {stats.patients_used !== 1 ? 's' : ''}
          </span>
          , and{' '}
          <span className="font-semibold text-gray-900 dark:text-white">
            {stats.departments_used} department
            {stats.departments_used !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Billing cycle dates for current subscription */}
      {currentSubscription && currentSubscription.activated_at && (
        <div className="mx-auto max-w-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-6 text-center">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Activated
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {new Date(
                  currentSubscription.activated_at
                ).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Expires
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {currentSubscription.expires_at
                  ? new Date(
                      currentSubscription.expires_at
                    ).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Show error message if plan change fails */}
      {changeError && (
        <div className="mx-auto max-w-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 text-red-700 dark:text-red-200 text-sm">
          <p className="font-semibold mb-1">Unable to change plan</p>
          <p>{changeError}</p>
        </div>
      )}

      {checkoutRecovery ? (
        <div className="space-y-3">
          <PaymentFlowNotice
            phase={checkoutRecovery.phase}
            eyebrow="Subscription checkout"
            title={
              checkoutRecovery.phase === 'collecting_payment'
                ? 'Your secure checkout is ready'
                : checkoutRecovery.phase === 'processing'
                  ? 'We are confirming your payment'
                  : checkoutRecovery.phase === 'awaiting_approval'
                    ? 'Payment confirmed. Awaiting super admin approval'
                    : 'Payment submitted, but activation is still pending'
            }
            description={
              checkoutRecovery.phase === 'collecting_payment'
                ? 'Return to Stripe to finish the subscription payment. Your plan change will remain pending until the payment is submitted.'
                : checkoutRecovery.phase === 'processing'
                  ? 'Stripe accepted your submission. We are waiting for the backend to confirm the payment before routing this request to a super admin.'
                  : checkoutRecovery.phase === 'awaiting_approval'
                    ? 'Your payment was captured successfully. A super admin must now approve or cancel this subscription request before the new plan can activate.'
                    : 'We still have not confirmed payment capture for this subscription change. Check again now, or clear this pending checkout and start over if you need to retry.'
            }
            primaryAction={
              checkoutRecovery.phase === 'collecting_payment'
                ? {
                    label: 'Resume checkout',
                    onClick: async () => {
                      setShowStripeModal(true);
                    },
                  }
                : {
                    label: 'Check status now',
                    onClick: handleCheckStatus,
                    loading: isCheckingStatus,
                  }
            }
            secondaryAction={
              checkoutRecovery.phase === 'attention_required'
                ? {
                    label: 'Clear pending checkout',
                    onClick: () => {
                      clearSubscriptionCheckout();
                      setPendingRequest(null);
                      setStatusFeedback(null);
                    },
                    variant: 'outline',
                  }
                : undefined
            }
          />
          {statusFeedback ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {statusFeedback}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Grid layout: 1 column on mobile, 2 on tablet, 4 on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
        {plans.map((plan) => {
          const recommendedPlanId = getRecommendedPlanId();
          const isRecommended = plan.id === recommendedPlanId;
          const canFit = canPlanFitStats(plan);
          const isRecoveryLocked =
            !!checkoutRecovery &&
            checkoutRecovery.phase !== 'attention_required';
          const lockedPlanId =
            pendingRequest?.subscription_plan_id ??
            checkoutRecovery?.planId ??
            null;
          const isLockedPlan =
            isRecoveryLocked && lockedPlanId === plan.id;
          const isOtherPlanDisabled =
            isRecoveryLocked &&
            lockedPlanId !== null &&
            lockedPlanId !== plan.id;
          const changingLabel =
            parseFloat(plan.price) <= 0
              ? 'Activating…'
              : checkoutRecovery?.phase === 'collecting_payment'
                ? 'Redirecting to payment…'
                : checkoutRecovery?.phase === 'processing'
                  ? 'Confirming payment…'
                  : checkoutRecovery?.phase === 'awaiting_approval'
                    ? 'Awaiting approval…'
                    : 'Check status…';

          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              // Check if this plan is the user's current subscription
              isCurrentPlan={
                plan.id === currentSubscription?.subscription_plan_id
              }
              isRecommended={isRecommended}
              canFitStats={canFit}
              onChangePlan={handleChangePlan}
              isChanging={changingPlanId === plan.id || isLockedPlan}
              isActionDisabled={isOtherPlanDisabled}
              changingLabel={changingLabel}
              buttonLabel={
                parseFloat(plan.price) <= 0
                  ? 'Choose Plan'
                  : 'Choose Plan'
              }
            />
          );
        })}
      </div>

      <StripePaymentModal
        clientSecret={stripeClientSecret ?? ''}
        open={showStripeModal && !!stripeClientSecret}
        onClose={async () => {
          if (checkoutRecovery?.phase === 'collecting_payment') {
            clearSubscriptionCheckout();
            setPendingRequest(null);
            setStatusFeedback(null);
            await refreshSubscriptionData();
            toast.message('Checkout cancelled.');
            return;
          }
          setShowStripeModal(false);
        }}
        onPaymentConfirmed={async () => {
          if (!checkoutRecovery) return;

          setShowStripeModal(false);
          setSubscriptionCheckoutRecovery({
            ...checkoutRecovery,
            clientSecret: null,
            phase: 'processing',
          });
          try {
            await checkoutService.syncStatus(
              checkoutRecovery.paymentId
            );
          } catch {
            // The recovery poller will retry and webhook delivery may still update the payment.
          }
          await refreshSubscriptionRequest(
            checkoutRecovery.referenceId
          );
        }}
        onPaymentFailed={async (errorMessage) => {
          clearSubscriptionCheckout();
          setPendingRequest(null);
          setStatusFeedback(null);
          await refreshSubscriptionData();
          toast.error(
            'Payment failed. The pending subscription checkout was cleared.',
            {
              description: errorMessage,
            }
          );
        }}
      />
    </div>
  );
}
