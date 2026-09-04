import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isApiError } from '@/lib/api-client';
import { requireAuth } from '@/lib/guards/requireAuth';
import {
  useCancelOrder,
  useMarkOrderPaid,
  useOrders,
  useRefundOrder,
  type Order,
  type OrderStatus,
} from '@/services/orders.service';
import { useAuthStore } from '@/stores/auth.store';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  formatCurrency,
  getOrderBadgeVariant,
} from '../shop/-utils';

export const Route = createFileRoute('/dashboard/tenant/orders')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_TENANT_ORDERS',
  }),
  component: TenantOrdersPage,
});

type OrderFilter = 'ALL' | OrderStatus;

function TenantOrdersPage() {
  const tenantId = Number(useAuthStore((state) => state.tenantId));
  const [statusFilter, setStatusFilter] =
    useState<OrderFilter>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [selectedOrder, setSelectedOrder] =
    useState<Order | null>(null);

  const ordersQuery = useOrders({
    tenantId: Number.isFinite(tenantId) ? tenantId : undefined,
    status: statusFilter,
    page,
    size: pageSize,
  });
  const cancelOrder = useCancelOrder();
  const refundOrder = useRefundOrder();
  const markPaid = useMarkOrderPaid();

  const orders = useMemo(
    () => ordersQuery.data?.items ?? [],
    [ordersQuery.data]
  );
  const totalPages = Math.max(
    1,
    Math.ceil(
      (ordersQuery.data?.total ?? 0) /
        (ordersQuery.data?.page_size ?? pageSize)
    )
  );

  useEffect(() => {
    setPage(1);
  }, [statusFilter, tenantId]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleCancel = async (orderId: number) => {
    try {
      await cancelOrder.mutateAsync(orderId);
      toast.success('Order cancelled');
      if (selectedOrder?.id === orderId) setSelectedOrder(null);
    } catch (error) {
      toast.error('Failed to cancel order', {
        description: isApiError(error)
          ? error.displayMessage
          : 'Request failed',
      });
    }
  };

  const handleMarkPaid = async (orderId: number) => {
    try {
      await markPaid.mutateAsync(orderId);
      toast.success('Order marked as paid');
      if (selectedOrder?.id === orderId) setSelectedOrder(null);
    } catch (error) {
      toast.error('Failed to mark order as paid', {
        description: isApiError(error)
          ? error.displayMessage
          : 'Request failed',
      });
    }
  };

  const handleRefund = async (orderId: number) => {
    try {
      await refundOrder.mutateAsync(orderId);
      toast.success('Order refunded');
      if (selectedOrder?.id === orderId) setSelectedOrder(null);
    } catch (error) {
      toast.error('Failed to refund order', {
        description: isApiError(error)
          ? error.displayMessage
          : 'Request failed',
      });
    }
  };

  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
            <CardDescription>
              Select a tenant context before managing orders.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-2xl">Orders</CardTitle>
            <CardDescription>
              Review tenant order activity, cancel unpaid orders, and mark captured orders as refunded.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'PENDING', 'PAID', 'CANCELLED', 'REFUNDED'] as const).map(
              (status) => (
                <Button
                  key={status}
                  variant={
                    statusFilter === status ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                </Button>
              )
            )}
          </div>
        </CardHeader>
        <CardContent>
          {ordersQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : ordersQuery.isError ? (
            <p className="text-sm text-destructive">
              {isApiError(ordersQuery.error)
                ? ordersQuery.error.displayMessage
                : 'Failed to load orders'}
            </p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No orders found for this filter.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead className="text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          #{order.id}
                        </TableCell>
                        <TableCell>
                          Patient #{order.patient_user_id}
                        </TableCell>
                        <TableCell>
                          {new Date(order.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getOrderBadgeVariant(order.status)}
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatCurrency(order.total_amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedOrder(order)}
                            >
                              View
                            </Button>
                            {order.status === 'PENDING' ? (
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleMarkPaid(order.id)
                                }
                                disabled={markPaid.isPending}
                              >
                                Mark as Paid
                              </Button>
                            ) : null}
                            {order.status !== 'PAID' &&
                            order.status !== 'CANCELLED' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleCancel(order.id)
                                }
                                disabled={cancelOrder.isPending}
                              >
                                Cancel
                              </Button>
                            ) : null}
                            {order.status === 'PAID' ? (
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleRefund(order.id)
                                }
                                disabled={refundOrder.isPending}
                              >
                                Refund
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Page {ordersQuery.data?.page ?? page} of{' '}
                  {totalPages}
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
        </CardContent>
      </Card>

      <Dialog
        open={selectedOrder !== null}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedOrder ? `Order #${selectedOrder.id}` : 'Order'}
            </DialogTitle>
            <DialogDescription>
              Itemized detail for the selected order.
            </DialogDescription>
          </DialogHeader>
          {selectedOrder ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground">
                      Patient
                    </p>
                    <p className="mt-1 font-medium">
                      #{selectedOrder.patient_user_id}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground">
                      Status
                    </p>
                    <Badge
                      className="mt-2"
                      variant={getOrderBadgeVariant(
                        selectedOrder.status
                      )}
                    >
                      {selectedOrder.status}
                    </Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground">
                      Total
                    </p>
                    <p className="mt-1 font-medium">
                      {formatCurrency(selectedOrder.total_amount)}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          {formatCurrency(item.price_at_purchase)}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(item.line_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
