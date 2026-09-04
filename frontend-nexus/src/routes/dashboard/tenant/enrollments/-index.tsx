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
import { Textarea } from '@/components/ui/textarea';
import {
  enrollmentsService,
  type EnrollmentStatus,
} from '@/services/enrollments.service';
import { useAuthStore } from '@/stores/auth.store';
import { useDialogStore } from '@/stores/use-dialog-store';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { QUERY_KEYS } from '../-constants';
import {
  getCurrentTenantWithFallback,
  getErrorMessage,
} from '../-utils';

type TenantStatusTab = EnrollmentStatus | 'HISTORY';

const STATUS_TABS: Array<{
  value: TenantStatusTab;
  label: string;
}> = [
  { value: 'ACTIVE', label: 'Approved' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
  {
    value: 'HISTORY',
    label: 'Enrollment History',
  },
];

function statusVariant(
  status: string
): 'success' | 'warning' | 'destructive' | 'expired' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'CANCELLED') return 'destructive';
  if (status === 'EXPIRED') return 'expired';
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

function EnrollmentTransitionDialogContent({
  target,
  pending,
  onConfirm,
}: {
  target: EnrollmentStatus;
  pending: boolean;
  onConfirm: (reason?: string) => void;
}) {
  const closeDialog = useDialogStore((state) => state.close);
  const [reason, setReason] = useState('');

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add an optional reason for moving this enrollment to{' '}
        <span className="font-medium text-foreground">{target}</span>.
      </p>
      <Textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Enter a reason for this transition..."
        rows={4}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={closeDialog}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => onConfirm(reason.trim() || undefined)}
          disabled={pending}
          loading={pending}
        >
          Confirm transition
        </Button>
      </div>
    </div>
  );
}

export function TenantEnrollmentsPanel() {
  const queryClient = useQueryClient();
  const openDialog = useDialogStore((state) => state.open);
  const closeDialog = useDialogStore((state) => state.close);
  const tenantIdFromStore = useAuthStore((state) => state.tenantId);
  const [activeStatus, setActiveStatus] =
    useState<TenantStatusTab>('ACTIVE');

  const tenantQuery = useQuery({
    queryKey: QUERY_KEYS.current,
    queryFn: () => getCurrentTenantWithFallback(tenantIdFromStore),
  });
  const tenantId = tenantQuery.data?.id;

  const enrollmentsQuery = useQuery({
    queryKey: ['tenant-manager', 'enrollments', tenantId],
    queryFn: () => enrollmentsService.list(tenantId!),
    enabled: !!tenantId,
  });

  const historyQuery = useQuery({
    queryKey: ['tenant-manager', 'enrollment-history', tenantId],
    queryFn: () => enrollmentsService.getHistory(tenantId!),
    enabled: !!tenantId && activeStatus === 'HISTORY',
  });

  const transitionMutation = useMutation({
    mutationFn: ({
      enrollmentId,
      target,
      reason,
    }: {
      enrollmentId: number;
      target: EnrollmentStatus;
      reason?: string;
    }) =>
      enrollmentsService.transition(
        tenantId!,
        enrollmentId,
        target,
        reason
      ),
    onSuccess: () => {
      toast.success('Enrollment updated');
      closeDialog();
      void queryClient.invalidateQueries({
        queryKey: ['tenant-manager', 'enrollments', tenantId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['tenant-manager', 'enrollment-history', tenantId],
      });
    },
    onError: (err) => {
      toast.error('Failed to update enrollment', {
        description: getErrorMessage(err),
      });
    },
  });

  const handleTransition = (
    enrollmentId: number,
    target: EnrollmentStatus
  ) => {
    openDialog({
      title:
        target === 'ACTIVE'
          ? 'Approve enrollment'
          : 'Update enrollment status',
      content: (
        <EnrollmentTransitionDialogContent
          target={target}
          pending={transitionMutation.isPending}
          onConfirm={(reason) =>
            transitionMutation.mutate({
              enrollmentId,
              target,
              reason,
            })
          }
        />
      ),
    });
  };

  const isLoading =
    tenantQuery.isLoading ||
    enrollmentsQuery.isLoading ||
    (activeStatus === 'HISTORY' && historyQuery.isLoading);
  const isError =
    tenantQuery.isError ||
    enrollmentsQuery.isError ||
    (activeStatus === 'HISTORY' && historyQuery.isError);
  const error =
    tenantQuery.error ?? enrollmentsQuery.error ?? historyQuery.error;

  const allEnrollments = enrollmentsQuery.data ?? [];
  const filteredEnrollments = allEnrollments.filter(
    (e) => e.status === activeStatus
  );
  const historyItems = historyQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            Enrollments
          </h1>
          <p className="text-muted-foreground">
            View and manage tenant enrollments, statuses, and full
            history.
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
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-8 text-center text-destructive">
            Error loading enrollments: {getErrorMessage(error)}
          </div>
        ) : activeStatus === 'HISTORY' ? (
          historyItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No history found for this tenant.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Enrollment ID</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Changed By</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.enrollment_id}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={statusVariant(item.old_status)}
                          >
                            {item.old_status}
                          </Badge>
                          <span className="text-muted-foreground">
                            →
                          </span>
                          <Badge
                            variant={statusVariant(item.new_status)}
                          >
                            {item.new_status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.changed_by ? (
                          <div>
                            <p>ID: {item.changed_by}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.changed_by_role}
                            </p>
                          </div>
                        ) : (
                          <span className="italic text-muted-foreground">
                            System
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                        {item.reason || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(item.changed_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : filteredEnrollments.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No {activeStatus.toLowerCase()} enrollments found.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Patient ID</TableHead>
                  <TableHead>Activated</TableHead>
                  <TableHead>Expires / Cancelled</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEnrollments.map((enrollment) => (
                  <TableRow key={enrollment.id}>
                    <TableCell className="font-medium">
                      {enrollment.id}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusVariant(enrollment.status)}
                      >
                        {enrollment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {enrollment.patient_user_id}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(enrollment.activated_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {enrollment.status === 'CANCELLED'
                        ? formatDateTime(enrollment.cancelled_at)
                        : formatDateTime(enrollment.expires_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(enrollment.updated_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {enrollment.status !== 'ACTIVE' &&
                          enrollment.status !== 'CANCELLED' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={transitionMutation.isPending}
                              onClick={() =>
                                handleTransition(
                                  enrollment.id,
                                  'ACTIVE'
                                )
                              }
                            >
                              Approve
                            </Button>
                          )}
                        {enrollment.status !== 'CANCELLED' &&
                          enrollment.status !== 'EXPIRED' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={transitionMutation.isPending}
                              onClick={() =>
                                handleTransition(
                                  enrollment.id,
                                  'CANCELLED'
                                )
                              }
                            >
                              Cancel
                            </Button>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
