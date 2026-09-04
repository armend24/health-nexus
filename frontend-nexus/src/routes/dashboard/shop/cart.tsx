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
import {
  useCart,
  useClearCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from '@/services/cart.service';
import { useCreateOrder } from '@/services/orders.service';
import { useAuthStore } from '@/stores/auth.store';
import {
  createFileRoute,
  Link,
  useNavigate,
} from '@tanstack/react-router';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatCurrency,
  getActiveTenantId,
} from './-utils';

export const Route = createFileRoute('/dashboard/shop/cart')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_CART',
  }),
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  const tenantId = getActiveTenantId(
    useAuthStore((state) => state.tenantId)
  );
  const cartQuery = useCart(tenantId);
  const updateItem = useUpdateCartItem(tenantId);
  const removeItem = useRemoveCartItem(tenantId);
  const clearCart = useClearCart();
  const createOrder = useCreateOrder();

  const cart = cartQuery.data;
  const total = cart?.subtotal ?? 0;

  const handleQuantityChange = async (
    itemId: number,
    quantity: number
  ) => {
    try {
      await updateItem.mutateAsync({
        itemId,
        payload: { quantity },
      });
    } catch (error) {
      toast.error('Failed to update quantity', {
        description: isApiError(error)
          ? error.displayMessage
          : 'Request failed',
      });
    }
  };

  const handleRemove = async (itemId: number) => {
    try {
      await removeItem.mutateAsync(itemId);
      toast.success('Item removed');
    } catch (error) {
      toast.error('Failed to remove item', {
        description: isApiError(error)
          ? error.displayMessage
          : 'Request failed',
      });
    }
  };

  const handlePlaceOrder = async () => {
    if (tenantId === null) return;
    try {
      const order = await createOrder.mutateAsync({
        tenant_id: tenantId,
      });
      toast.success('Order created');
      navigate({
        to: '/dashboard/shop/checkout/$orderId',
        params: { orderId: String(order.id) },
      });
    } catch (error) {
      toast.error('Failed to create order', {
        description: isApiError(error)
          ? error.displayMessage
          : 'Request failed',
      });
    }
  };

  const handleClear = async () => {
    if (tenantId === null) return;
    try {
      await clearCart.mutateAsync(tenantId);
      toast.success('Cart cleared');
    } catch (error) {
      toast.error('Failed to clear cart', {
        description: isApiError(error)
          ? error.displayMessage
          : 'Request failed',
      });
    }
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Cart</h1>
          <p className="text-muted-foreground">
            Adjust quantities before turning your cart into an order.
          </p>
        </div>
        <Link to="/dashboard/shop/">
          <Button variant="outline">Continue Shopping</Button>
        </Link>
      </div>

      {cartQuery.isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : cartQuery.isError ? (
        <Card>
          <CardContent className="pt-6 text-destructive">
            {isApiError(cartQuery.error)
              ? cartQuery.error.displayMessage
              : 'Failed to load cart'}
          </CardContent>
        </Card>
      ) : !cart || cart.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="rounded-full bg-primary/10 p-4 text-primary">
              <Trash2 className="size-8" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Your cart is empty</h2>
              <p className="text-sm text-muted-foreground">
                Add products from the shop to start an order.
              </p>
            </div>
            <Link to="/dashboard/shop/">
              <Button>Browse Products</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Items</CardTitle>
                <CardDescription>
                  Review each item before checkout.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={clearCart.isPending}
              >
                Clear Cart
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(item.product.price)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-md border">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          handleQuantityChange(
                            item.id,
                            Math.max(0, item.quantity - 1)
                          )
                        }
                        disabled={updateItem.isPending}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="min-w-10 text-center text-sm">
                        {item.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          handleQuantityChange(
                            item.id,
                            item.quantity + 1
                          )
                        }
                        disabled={updateItem.isPending}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <div className="min-w-24 text-right text-sm font-medium">
                      {formatCurrency(item.line_total)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(item.id)}
                      disabled={removeItem.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
              <CardDescription>
                Tax and discount are currently zero for this flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-lg font-semibold">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handlePlaceOrder}
                loading={createOrder.isPending}
              >
                Place Order
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
