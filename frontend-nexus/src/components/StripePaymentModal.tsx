import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import type {
  PaymentIntent,
  StripeCardElementOptions,
  StripeError,
} from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import {
  AlertTriangle,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import React from 'react';

const stripePromise = loadStripe(
  import.meta.env?.VITE_STRIPE_PUBLIC_KEY ?? ''
);

function isRetryableStripeError(error: StripeError): boolean {
  return error.type === 'validation_error';
}

function isDeclinedStripeError(error: StripeError): boolean {
  return (
    error.code === 'card_declined' ||
    typeof error.decline_code === 'string'
  );
}

interface StripePaymentModalProps {
  clientSecret: string;
  open: boolean;
  onClose: () => void;
  onPaymentConfirmed: (
    paymentIntent: PaymentIntent | null
  ) => void | Promise<void>;
  onPaymentFailed?: (
    errorMessage: string,
    paymentIntent: PaymentIntent | null
  ) => void | Promise<void>;
}

function StripePaymentForm({
  clientSecret,
  onClose,
  onPaymentConfirmed,
  onPaymentFailed,
}: {
  clientSecret: string;
  onClose: () => void;
  onPaymentConfirmed: (
    paymentIntent: PaymentIntent | null
  ) => void | Promise<void>;
  onPaymentFailed?: (
    errorMessage: string,
    paymentIntent: PaymentIntent | null
  ) => void | Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<
    string | null
  >(null);
  const [showDeclinedState, setShowDeclinedState] =
    React.useState(false);

  React.useEffect(() => {
    setErrorMessage(null);
    setShowDeclinedState(false);
    setIsSubmitting(false);
  }, [clientSecret]);

  const cardElementOptions: StripeCardElementOptions = {
    hidePostalCode: true,
    style: {
      base: {
        color: '#1f2937',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '16px',
        fontSmoothing: 'antialiased',
        '::placeholder': {
          color: '#94a3b8',
        },
      },
      invalid: {
        color: '#dc2626',
        iconColor: '#dc2626',
      },
    },
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setErrorMessage(
        'Card form is not ready yet. Please try again.'
      );
      setIsSubmitting(false);
      return;
    }

    if (!clientSecret) {
      setErrorMessage(
        'Payment session is missing. Please reopen checkout.'
      );
      setIsSubmitting(false);
      return;
    }

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
      },
    });

    if (result.error) {
      const nextErrorMessage =
        result.error.message || 'Payment failed. Please try again.';
      if (isDeclinedStripeError(result.error)) {
        await onPaymentFailed?.(
          nextErrorMessage,
          result.paymentIntent ?? null
        );
        setErrorMessage(null);
        setShowDeclinedState(true);
      } else {
        setErrorMessage(nextErrorMessage);
        if (!isRetryableStripeError(result.error)) {
          await onPaymentFailed?.(
            nextErrorMessage,
            result.paymentIntent ?? null
          );
        }
      }
    } else {
      await onPaymentConfirmed(result.paymentIntent ?? null);
    }

    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {showDeclinedState ? (
        <>
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">
                  Your card has been declined
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  The enrollment was cancelled automatically. Close
                  this payment window and try again with another card
                  if you still want to subscribe.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t pt-5">
            <Button type="button" size="lg" onClick={onClose}>
              Close
            </Button>
          </div>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CreditCard className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Card details
                </p>
                <p className="text-sm text-muted-foreground">
                  Enter your payment information to activate the plan.
                </p>
              </div>
            </div>

            <div className="rounded-xl border bg-background px-4 py-4 shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-primary/20">
              <CardElement options={cardElementOptions} />
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-muted/30 p-5 shadow-sm">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Checkout summary
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We only activate your enrollment after Stripe
                  confirms the payment.
                </p>
              </div>

              <div className="rounded-xl border bg-background/90 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Protected checkout
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Card data is processed securely by Stripe and
                      never stored by this app.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-background/90 p-4">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="mt-0.5 size-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Instant activation
                    </p>
                    <p className="text-sm text-muted-foreground">
                      After Stripe accepts the payment, we verify the
                      final activation status in the background.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!showDeclinedState ? (
        <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="lg"
            className="min-w-[160px] shadow-sm"
            loading={isSubmitting}
            disabled={!stripe}
          >
            Pay securely
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function StripePaymentModalBody({
  clientSecret,
  onClose,
  onPaymentConfirmed,
  onPaymentFailed,
}: {
  clientSecret: string;
  onClose: () => void;
  onPaymentConfirmed: (
    paymentIntent: PaymentIntent | null
  ) => void | Promise<void>;
  onPaymentFailed?: (
    errorMessage: string,
    paymentIntent: PaymentIntent | null
  ) => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <DialogHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Secure payment
        </div>
        <DialogTitle className="text-2xl sm:text-3xl">
          Complete your plan checkout
        </DialogTitle>
        <DialogDescription className="max-w-2xl text-sm leading-6">
          Finish payment to start activation. We will confirm the
          final status here as soon as the backend receives Stripe
          confirmation.
        </DialogDescription>
      </DialogHeader>

      <StripePaymentForm
        clientSecret={clientSecret}
        onClose={onClose}
        onPaymentConfirmed={onPaymentConfirmed}
        onPaymentFailed={onPaymentFailed}
      />
    </div>
  );
}

export function StripePaymentModal({
  clientSecret,
  open,
  onClose,
  onPaymentConfirmed,
  onPaymentFailed,
}: StripePaymentModalProps) {
  if (!clientSecret) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
    >
      <DialogContent
        className="max-w-[920px] gap-6 overflow-hidden rounded-3xl border-border/70 p-0 shadow-2xl"
        showCloseButton
      >
        <div className="border-b bg-gradient-to-br from-primary/10 via-background to-background px-6 py-6 sm:px-8">
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <StripePaymentModalBody
              clientSecret={clientSecret}
              onClose={onClose}
              onPaymentConfirmed={onPaymentConfirmed}
              onPaymentFailed={onPaymentFailed}
            />
          </Elements>
        </div>
      </DialogContent>
    </Dialog>
  );
}
