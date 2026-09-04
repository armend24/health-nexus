import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { API_BASE_URL, getAccessToken } from '@/lib/api-client';
import { requireAuth } from '@/lib/guards/requireAuth';
import {
  listAdminSubscriptionRequests,
  transitionAdminSubscriptionRequest,
  type AdminSubscriptionRequest,
  type AdminSubscriptionStatus,
} from '@/services/admin-subscriptions.service';
import { checkoutService } from '@/services/checkout.service';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/dashboard/subscriptions')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_SUBSCRIPTIONS',
  }),
  component: DashboardSubscriptionsPage,
});

type StatusTab = AdminSubscriptionStatus | 'ALL';

const STATUS_TABS: Array<{ value: StatusTab; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACTIVE', label: 'Approved' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'ALL', label: 'All' },
];

function statusVariant(
  status: AdminSubscriptionStatus
): 'success' | 'warning' | 'destructive' | 'expired' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'CANCELLED') return 'destructive';
  if (status === 'EXPIRED') return 'expired';
  return 'neutral';
}

function paymentVariant(
  status: string | null
): 'success' | 'warning' | 'destructive' | 'neutral' {
  if (status === 'CAPTURED') return 'success';
  if (status === 'INITIATED' || status === 'AUTHORIZED') {
    return 'warning';
  }
  if (status === 'FAILED' || status === 'CANCELED') {
    return 'destructive';
  }
  return 'neutral';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function DashboardSubscriptionsPage() {
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] =
    useState<StatusTab>('PENDING');

  const requestsQuery = useQuery({
    queryKey: ['super-admin', 'subscription-requests', activeStatus],
    queryFn: () =>
      listAdminSubscriptionRequests(
        activeStatus === 'ALL' ? undefined : activeStatus
      ),
  });

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    const controller = new AbortController();

    const connect = async () => {
      const response = await fetch(
        `${API_BASE_URL}/api/superadmin/subscriptions/stream`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
        }
      );

      if (!response.ok || !response.body) {
        throw new Error('Unable to open subscription request stream');
      }

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();

      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += value;
        const messages = buffer.split('\n\n');
        buffer = messages.pop() ?? '';

        for (const message of messages) {
          const eventLine = message
            .split('\n')
            .find((line) => line.startsWith('event: '));

          if (eventLine !== 'event: subscription-ready') {
            continue;
          }

          setActiveStatus('PENDING');
          void queryClient.invalidateQueries({
            queryKey: ['super-admin', 'subscription-requests'],
          });
        }
      }
    };

    void connect().catch(() => {
      // Leave the current table visible if the stream disconnects.
    });

    return () => {
      controller.abort();
    };
  }, [queryClient]);

  const transitionMutation = useMutation({
    mutationFn: ({
      subscriptionId,
      target,
      reason,
    }: {
      subscriptionId: number;
      target: 'ACTIVE' | 'CANCELLED';
      reason?: string;
    }) =>
      transitionAdminSubscriptionRequest(
        subscriptionId,
        target,
        reason
      ),
    onSuccess: (_, variables) => {
      toast.success(
        variables.target === 'ACTIVE'
          ? 'Subscription approved'
          : 'Subscription cancelled'
      );
      void queryClient.invalidateQueries({
        queryKey: ['super-admin', 'subscription-requests'],
      });
    },
    onError: (error) => {
      toast.error('Failed to update subscription request', {
        description: getErrorMessage(error),
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (request: AdminSubscriptionRequest) => {
      if (!request.latest_payment_id) {
        throw new Error('No payment found for this request.');
      }

      const syncedPayment = await checkoutService.syncStatus(
        request.latest_payment_id
      );
      if (syncedPayment.status !== 'CAPTURED') {
        throw new Error(
          `Payment is ${syncedPayment.status}. Approval is only allowed after capture.`
        );
      }

      return transitionAdminSubscriptionRequest(request.id, 'ACTIVE');
    },
    onSuccess: () => {
      toast.success('Subscription approved');
      void queryClient.invalidateQueries({
        queryKey: ['super-admin', 'subscription-requests'],
      });
    },
    onError: (error) => {
      toast.error('Failed to approve subscription request', {
        description: getErrorMessage(error),
      });
    },
  });

  const handleTransition = (
    request: AdminSubscriptionRequest,
    target: 'ACTIVE' | 'CANCELLED'
  ) => {
    const reason =
      target === 'CANCELLED'
        ? window.prompt('Reason for cancellation?')
        : undefined;

    transitionMutation.mutate({
      subscriptionId: request.id,
      target,
      reason: reason?.trim() || undefined,
    });
  };

  const requests = requestsQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            Subscription Requests
          </h1>
          <p className="text-muted-foreground">
            Review tenant plan changes after payment. Super admins can
            approve captured requests or cancel pending or active
            plans.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              type="button"
              variant={
                activeStatus === tab.value ? 'default' : 'outline'
              }
              size="sm"
              onClick={() => setActiveStatus(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {requestsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : requestsQuery.isError ? (
          <div className="py-8 text-center text-destructive">
            Error loading subscription requests:{' '}
            {getErrorMessage(requestsQuery.error)}
          </div>
        ) : requests.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No subscription requests found for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Request Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => {
                  const canApprove =
                    request.admin_status === 'PENDING' &&
                    !!request.latest_payment_id;
                  const canCancel =
                    request.admin_status === 'PENDING' ||
                    request.admin_status === 'ACTIVE';

                  return (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="font-medium">
                          {request.tenant_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Request #{request.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        {request.subscription_plan_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant(
                            request.admin_status
                          )}
                        >
                          {request.admin_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={paymentVariant(
                              request.latest_payment_status
                            )}
                          >
                            {request.latest_payment_status ??
                              'NO_PAYMENT'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {request.latest_payment_amount == null
                              ? '—'
                              : `$${request.latest_payment_amount.toFixed(2)}`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatDateTime(request.created_at)}
                      </TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">
                        {request.cancellation_reason ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              approveMutation.mutate(request);
                            }}
                            disabled={
                              !canApprove ||
                              transitionMutation.isPending ||
                              approveMutation.isPending
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleTransition(request, 'CANCELLED')
                            }
                            disabled={
                              !canCancel ||
                              transitionMutation.isPending ||
                              approveMutation.isPending
                            }
                          >
                            {request.admin_status === 'ACTIVE'
                              ? 'Cancel plan'
                              : 'Cancel'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
