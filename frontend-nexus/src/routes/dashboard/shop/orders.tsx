import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActiveTenantContext } from '@/components/molecules/active-tenant-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api-client';
import { requireAuth } from '@/lib/guards/requireAuth';
import {
  useCancelOrder,
  useOrder,
  useOrders,
} from '@/services/orders.service';
import { useAuthStore } from '@/stores/auth.store';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  formatCurrency,
  getActiveTenantId,
  getOrderBadgeVariant,
} from './-utils';

export const Route = createFileRoute('/dashboard/shop/orders')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_MY_ORDERS',
  }),
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const tenantId = getActiveTenantId(
    useAuthStore((state) => state.tenantId)
  );
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const ordersQuery = useOrders({
    tenantId,
    page,
    size: pageSize,
  });
  const cancelOrder = useCancelOrder();
  const [selectedOrderId, setSelectedOrderId] = useState<
    number | null
  >(null);
  const orderDetailQuery = useOrder(selectedOrderId);
  const selectedOrder = orderDetailQuery.data;
  const totalPages = Math.max(
    1,
    Math.ceil(
      (ordersQuery.data?.total ?? 0) /
        (ordersQuery.data?.page_size ?? pageSize)
    )
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleCancel = async (orderId: number) => {
    try {
      await cancelOrder.mutateAsync(orderId);
      toast.success('Order cancelled');
      setSelectedOrderId(null);
    } catch (error) {
      toast.error('Failed to cancel order', {
        description: isApiError(error)
          ? error.displayMessage
          : 'Request failed',
      });
    }
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">My Orders</h1>
        <p className="text-muted-foreground">
          Review your recent orders and cancel pending ones before payment.
        </p>
      </div>

      <ActiveTenantContext
        tenantId={tenantId}
        title="Showing orders for"
        description="Order history on this page is filtered to the active tenant."
      />

      {ordersQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : ordersQuery.isError ? (
        <Card>
          <CardContent className="pt-6 text-destructive">
            {isApiError(ordersQuery.error)
              ? ordersQuery.error.displayMessage
              : 'Failed to load orders'}
          </CardContent>
        </Card>
      ) : (ordersQuery.data?.items.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No orders yet for this tenant.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {ordersQuery.data?.items.map((order) => (
            <Card key={order.id}>
              <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{`Order #${order.id}`}</p>
                    <Badge
                      variant={getOrderBadgeVariant(order.status)}
                    >
                      {order.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold">
                    {formatCurrency(order.total_amount)}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    View Details
                  </Button>
                  {order.status === 'PENDING' ? (
                    <Button
                      onClick={() => handleCancel(order.id)}
                      disabled={cancelOrder.isPending}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Page {ordersQuery.data?.page ?? page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((current) => current - 1)}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={selectedOrderId !== null}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      >
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>
              {selectedOrder
                ? `Order #${selectedOrder.id}`
                : selectedOrderId
                  ? `Order #${selectedOrderId}`
                  : 'Order'}
            </DialogTitle>
            <DialogDescription>
              Review the full order breakdown and current status.
            </DialogDescription>
          </DialogHeader>
          {orderDetailQuery.isLoading ? (
            <div className="p-6">
              <Skeleton className="h-72 w-full" />
            </div>
          ) : orderDetailQuery.isError ? (
            <div className="p-6 text-destructive">
              {isApiError(orderDetailQuery.error)
                ? orderDetailQuery.error.displayMessage
                : 'Failed to load order details'}
            </div>
          ) : selectedOrder ? (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Card className="bg-muted/20">
                      <CardContent className="pt-5">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Order ID
                        </p>
                        <p className="mt-2 text-lg font-semibold">
                          #{selectedOrder.id}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/20">
                      <CardContent className="pt-5">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Date
                        </p>
                        <p className="mt-2 text-sm font-medium">
                          {new Date(
                            selectedOrder.created_at
                          ).toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/20">
                      <CardContent className="pt-5">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Status
                        </p>
                        <div className="mt-2">
                          <Badge
                            variant={getOrderBadgeVariant(
                              selectedOrder.status
                            )}
                          >
                            {selectedOrder.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/20">
                      <CardContent className="pt-5">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Total
                        </p>
                        <p className="mt-2 text-lg font-semibold">
                          {formatCurrency(selectedOrder.total_amount)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Order items
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedOrder.items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-medium">
                                {item.product_name}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Product #{item.product_id}
                              </p>
                            </div>
                            <p className="text-base font-semibold">
                              {formatCurrency(item.line_total)}
                            </p>
                          </div>
                          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Quantity
                              </p>
                              <p className="mt-1 font-medium">
                                {item.quantity}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Unit price
                              </p>
                              <p className="mt-1 font-medium">
                                {formatCurrency(
                                  item.price_at_purchase
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Line total
                              </p>
                              <p className="mt-1 font-medium">
                                {formatCurrency(item.line_total)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="shrink-0 border-t bg-background px-6 py-4">
                <Card className="bg-muted/20">
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Subtotal
                      </span>
                      <span>{formatCurrency(selectedOrder.subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Tax
                      </span>
                      <span>{formatCurrency(selectedOrder.tax)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Discount
                      </span>
                      <span>
                        {formatCurrency(selectedOrder.discount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t pt-3 text-base font-semibold">
                      <span>Order total</span>
                      <span>
                        {formatCurrency(selectedOrder.total_amount)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {selectedOrder.status === 'PENDING' ? (
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => handleCancel(selectedOrder.id)}
                      disabled={cancelOrder.isPending}
                    >
                      Cancel Order
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
