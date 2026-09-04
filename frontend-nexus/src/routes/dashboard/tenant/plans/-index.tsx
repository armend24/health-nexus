import { FormField } from '@/components/atoms/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  tenantPlansService,
  type TenantPlanApi,
} from '@/services/tenant-plans.service';
import { useAuthStore } from '@/stores/auth.store';
import { useDialogStore } from '@/stores/use-dialog-store';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { QUERY_KEYS } from '../-constants';
import { getCurrentTenantWithFallback } from '../-utils';

export function TenantPlansPanel() {
  const { open: openDialog, close: closeDialog } = useDialogStore();
  const queryClient = useQueryClient();
  const tenantIdFromStore = useAuthStore((state) => state.tenantId);
  const tenantQuery = useQuery({
    queryKey: QUERY_KEYS.current,
    queryFn: () => getCurrentTenantWithFallback(tenantIdFromStore),
  });
  const tenantId = tenantQuery.data?.id;

  const plansQuery = useQuery({
    queryKey: ['tenant-manager', 'plans', tenantId],
    queryFn: () => tenantPlansService.listByTenant(tenantId!),
    enabled: !!tenantId,
  });

  const enrollmentsQuery = useQuery({
    queryKey: ['tenant-manager', 'enrollments', tenantId],
    queryFn: () => tenantPlansService.listEnrollments(tenantId!),
    enabled: !!tenantId,
  });

  const pricingBoundsQuery = useQuery({
    queryKey: ['tenant-manager', 'pricing-bounds', tenantId],
    queryFn: () => tenantPlansService.getPricingBounds(tenantId!),
    enabled: !!tenantId,
  });
  const bounds = pricingBoundsQuery.data;

  const [formState, setFormState] = useState({
    name: '',
    description: '',
    price: '',
    duration: '30',
    max_appointments: '',
    max_consultations: '',
  });
  const [editingPlanId, setEditingPlanId] = useState<number | null>(
    null
  );

  const resetForm = () => {
    setFormState({
      name: '',
      description: '',
      price: '',
      duration: '30',
      max_appointments: '',
      max_consultations: '',
    });
    setEditingPlanId(null);
  };

  const createMutation = useMutation({
    mutationFn: (
      data: Parameters<typeof tenantPlansService.create>[0]
    ) => tenantPlansService.create(data),
    onSuccess: () => {
      toast.success('Plan created');
      queryClient.invalidateQueries({
        queryKey: ['tenant-manager', 'plans'],
      });
      resetForm();
    },
    onError: (err) =>
      toast.error(
        isApiError(err) ? err.displayMessage : 'Failed to create plan'
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Parameters<typeof tenantPlansService.update>[1];
    }) => tenantPlansService.update(id, data),
    onSuccess: () => {
      toast.success('Plan updated');
      queryClient.invalidateQueries({
        queryKey: ['tenant-manager', 'plans'],
      });
      resetForm();
    },
    onError: (err) =>
      toast.error(
        isApiError(err) ? err.displayMessage : 'Failed to update plan'
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tenantPlansService.delete(id),
    onSuccess: () => {
      toast.success('Plan deleted');
      closeDialog();
      queryClient.invalidateQueries({
        queryKey: ['tenant-manager', 'plans'],
      });
    },
    onError: (err) =>
      toast.error(
        isApiError(err) ? err.displayMessage : 'Failed to delete plan'
      ),
  });

  const confirmDeletePlan = (planId: number) => {
    openDialog({
      title: 'Delete plan',
      content: (
        <p className="text-muted-foreground text-sm">
          Are you sure you want to delete this plan? This action
          cannot be undone.
        </p>
      ),
      footer: (
        <>
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate(planId)}
          >
            Delete
          </Button>
        </>
      ),
    });
  };

  const toggleMutation = useMutation({
    mutationFn: ({
      id,
      is_active,
    }: {
      id: number;
      is_active: boolean;
    }) =>
      tenantPlansService.update(id, {
        is_active,
      }),
    onSuccess: () => {
      toast.success('Plan visibility updated');
      queryClient.invalidateQueries({
        queryKey: ['tenant-manager', 'plans'],
      });
    },
    onError: (err) =>
      toast.error(
        isApiError(err) ? err.displayMessage : 'Failed to toggle plan'
      ),
  });

  const handleSubmit = () => {
    if (!tenantId) return;
    const price = Number(formState.price);
    if (!formState.name.trim() || price <= 0) {
      toast.error('Plan name and a valid price > 0 are required');
      return;
    }
    if (
      bounds?.min_price != null &&
      bounds?.max_price != null &&
      (price < bounds.min_price || price > bounds.max_price)
    ) {
      toast.error(
        `Price must be between €${bounds.min_price.toFixed(2)} and €${bounds.max_price.toFixed(2)} for your subscription tier.`
      );
      return;
    }

    const payload = {
      name: formState.name.trim(),
      description: formState.description.trim() || null,
      price,
      duration: formState.duration ? Number(formState.duration) : 30,
      max_appointments: formState.max_appointments
        ? Number(formState.max_appointments)
        : null,
      max_consultations: formState.max_consultations
        ? Number(formState.max_consultations)
        : null,
      is_active: true,
    };

    if (editingPlanId != null) {
      updateMutation.mutate({
        id: editingPlanId,
        data: payload,
      });
      return;
    }

    openDialog({
      title: 'Add this plan?',
      content: (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Plan name</span>
            <span className="font-medium">{payload.name}</span>
          </div>
          {payload.description && (
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">
                Description
              </span>
              <span>{payload.description}</span>
            </div>
          )}
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Price</span>
            <span className="font-medium">
              €{payload.price.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Duration</span>
            <span>{payload.duration} days</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">
              Max appointments
            </span>
            <span>{payload.max_appointments ?? 'Unlimited'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Max consultations
            </span>
            <span>{payload.max_consultations ?? 'Unlimited'}</span>
          </div>
        </div>
      ),
      footer: (
        <>
          <Button variant="outline" onClick={closeDialog}>
            Edit
          </Button>
          <Button
            onClick={() => {
              closeDialog();
              createMutation.mutate({
                ...payload,
                tenant_id: tenantId,
              });
            }}
          >
            Add plan
          </Button>
        </>
      ),
    });
  };

  const handleEdit = (plan: TenantPlanApi) => {
    setEditingPlanId(plan.id);
    setFormState({
      name: plan.name,
      description: plan.description ?? '',
      price: String(plan.price),
      duration: plan.duration != null ? String(plan.duration) : '30',
      max_appointments:
        plan.max_appointments != null
          ? String(plan.max_appointments)
          : '',
      max_consultations:
        plan.max_consultations != null
          ? String(plan.max_consultations)
          : '',
    });
  };

  const plans = plansQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Plans</h1>
          <p className="text-muted-foreground">
            Add plans and toggle visibility. Changes are saved to the
            backend.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <FormField
            id="plan-name"
            label="Plan name"
            placeholder="e.g. Family Plus"
            value={formState.name}
            onChange={(e) =>
              setFormState((s) => ({
                ...s,
                name: e.target.value,
              }))
            }
          />
          <FormField
            id="plan-desc"
            label="Description"
            placeholder="Optional description"
            value={formState.description}
            onChange={(e) =>
              setFormState((s) => ({
                ...s,
                description: e.target.value,
              }))
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <FormField
                id="plan-price"
                label="Price (EUR)"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0"
                value={formState.price}
                onChange={(e) =>
                  setFormState((s) => ({
                    ...s,
                    price: e.target.value,
                  }))
                }
              />
              {bounds?.min_price != null &&
              bounds?.max_price != null ? (
                <p
                  data-testid="pricing-bounds-hint"
                  className="text-xs text-muted-foreground"
                >
                  Allowed range for your subscription: €
                  {bounds.min_price.toFixed(2)} – €
                  {bounds.max_price.toFixed(2)}
                </p>
              ) : null}
            </div>
            <FormField
              id="plan-duration"
              label="Duration (days)"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder="30"
              value={formState.duration}
              onChange={(e) =>
                setFormState((s) => ({
                  ...s,
                  duration: e.target.value,
                }))
              }
            />
            <FormField
              id="plan-max-apt"
              label="Max appointments"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Unlimited"
              value={formState.max_appointments}
              onChange={(e) =>
                setFormState((s) => ({
                  ...s,
                  max_appointments: e.target.value,
                }))
              }
            />
            <FormField
              id="plan-max-con"
              label="Max consultations"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Unlimited"
              value={formState.max_consultations}
              onChange={(e) =>
                setFormState((s) => ({
                  ...s,
                  max_consultations: e.target.value,
                }))
              }
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={
                createMutation.isPending || updateMutation.isPending
              }
            >
              {editingPlanId != null ? 'Update plan' : 'Add plan'}
            </Button>
            {editingPlanId != null && (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        {plans.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              Existing plans (edit, toggle visibility, or remove):
            </p>
            <div className="flex flex-wrap gap-2">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm"
                >
                  <span className="font-medium">{plan.name}</span>
                  <span className="text-muted-foreground">
                    €{Number(plan.price).toFixed(2)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Edit"
                    onClick={() => handleEdit(plan)}
                  >
                    <IconPencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-1.5 py-0.5 text-xs"
                    onClick={() =>
                      toggleMutation.mutate({
                        id: plan.id,
                        is_active: !plan.is_active,
                      })
                    }
                  >
                    {plan.is_active ? 'Hide' : 'Show'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete"
                    className="text-destructive hover:text-destructive"
                    onClick={() => confirmDeletePlan(plan.id)}
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {plans.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={
                  plan.is_active === false ? 'opacity-50' : ''
                }
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {plan.name}
                    </CardTitle>
                    <Badge
                      variant={
                        plan.is_active !== false
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {plan.is_active !== false ? 'Active' : 'Hidden'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold">
                    €{Number(plan.price).toFixed(2)}
                  </p>
                  {plan.description && (
                    <p className="text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-muted-foreground">
                        Appointments
                      </span>
                      <span>
                        {plan.max_appointments ?? 'Unlimited'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Consultations
                      </span>
                      <span>
                        {plan.max_consultations ?? 'Unlimited'}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Plan availability is managed by the tenant
                    manager. Users can choose from the currently
                    offered plans.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Selected plans
            </CardTitle>
            <CardDescription>
              Users who have subscribed to your plans.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enrollmentsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (enrollmentsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No users have subscribed to a plan yet.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Subscribed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(enrollmentsQuery.data ?? []).map(
                      (enrollment) => (
                        <TableRow key={enrollment.id}>
                          <TableCell>
                            {enrollment.patient_first_name ||
                            enrollment.patient_last_name ? (
                              `${enrollment.patient_first_name ?? ''} ${enrollment.patient_last_name ?? ''}`.trim()
                            ) : (
                              <span className="text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {enrollment.patient_email ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {enrollment.plan_name}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                enrollment.status === 'ACTIVE'
                                  ? 'default'
                                  : enrollment.status === 'CANCELLED'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              {enrollment.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {enrollment.activated_at
                              ? new Date(
                                  enrollment.activated_at
                                ).toLocaleDateString()
                              : enrollment.created_at
                                ? new Date(
                                    enrollment.created_at
                                  ).toLocaleDateString()
                                : '—'}
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
