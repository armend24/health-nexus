import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api-client';
import { requireAuth } from '@/lib/guards/requireAuth';
import { checkoutService } from '@/services/checkout.service';
import { useOrder } from '@/services/orders.service';
import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatCurrency } from './-utils';

export const Route = createFileRoute(
  '/dashboard/shop/checkout/$orderId'
)({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_CART',
  }),
  component: CheckoutPage,
});

const stripePromise = loadStripe(
  import.meta.env?.VITE_STRIPE_PUBLIC_KEY ?? ''
);

function CheckoutForm({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!stripe || !elements || isSubmitting) return;

    setIsSubmitting(true);
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    setIsSubmitting(false);

    if (result.error) {
      toast.error('Payment failed', {
        description:
          result.error.message ?? 'Stripe confirmation failed',
      });
      return;
    }

    toast.success('Payment submitted');
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button
        type="submit"
        className="w-full"
        loading={isSubmitting}
        disabled={!stripe}
      >
        Confirm Payment
      </Button>
    </form>
  );
}

function CheckoutPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const orderIdNumber = Number(orderId);
  const orderQuery = useOrder(
    Number.isFinite(orderIdNumber) ? orderIdNumber : null
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const checkoutQuery = useQuery({
    queryKey: ['checkout-initiate', orderIdNumber, idempotencyKey],
    queryFn: () =>
      checkoutService.initiate(
        { order_id: orderIdNumber },
        idempotencyKey
      ),
    enabled: Number.isFinite(orderIdNumber),
    retry: false,
  });

  const handleSuccess = () => {
    navigate({ to: '/dashboard/shop/orders' });
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Checkout</h1>
        <p className="text-muted-foreground">
          Complete secure payment for your order.
        </p>
      </div>

      {orderQuery.isLoading || checkoutQuery.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : orderQuery.isError || checkoutQuery.isError ? (
        <Card>
          <CardContent className="pt-6 text-destructive">
            {isApiError(orderQuery.error)
              ? orderQuery.error.displayMessage
              : isApiError(checkoutQuery.error)
                ? checkoutQuery.error.displayMessage
                : 'Failed to prepare checkout'}
          </CardContent>
        </Card>
      ) : orderQuery.data && checkoutQuery.data ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
              <CardDescription>
                Stripe securely processes this order payment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: checkoutQuery.data.stripe_client_secret,
                }}
              >
                <CheckoutForm onSuccess={handleSuccess} />
              </Elements>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {orderQuery.data.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-muted-foreground">
                      Qty {item.quantity}
                    </p>
                  </div>
                  <span>{formatCurrency(item.line_total)}</span>
                </div>
              ))}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-lg font-semibold">
                    {formatCurrency(orderQuery.data.total_amount)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
