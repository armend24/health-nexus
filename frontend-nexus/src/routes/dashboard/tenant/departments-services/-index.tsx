import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  ServiceLandingItem,
  ServiceUpdateInput,
  TenantDepartmentWithServicesRead,
} from '@/interfaces';
import { isApiError } from '@/lib/api-client';
import { tenantsService } from '@/services/tenants.service';
import { useDialogStore } from '@/stores/use-dialog-store';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  QUERY_KEYS,
  type DepartmentDraft,
  type DepartmentFormModalState,
  type ServiceFormState,
} from '../-constants';
import {
  Field,
  RowActions,
  RowIconActionButton,
  StandardTable,
} from '../-shared';
import {
  createLocalId,
  emptyDepartmentForm,
  emptyServiceForm,
  formatCurrency,
  getErrorMessage,
  mapTenantDepartmentToDraft,
  nullIfBlank,
} from '../-utils';

export function TenantDepartmentsManager() {
  const queryClient = useQueryClient();
  const { open: openDialog, close: closeDialog } = useDialogStore();

  const catalogQuery = useQuery({
    queryKey: QUERY_KEYS.departmentCatalog,
    queryFn: () => tenantsService.listDepartmentCatalog(),
  });
  const tenantDepartmentsQuery = useQuery({
    queryKey: QUERY_KEYS.departments,
    queryFn: async () => {
      try {
        return await tenantsService.listTenantDepartments();
      } catch (err) {
        if (isApiError(err) && err.status === 404)
          return [] as TenantDepartmentWithServicesRead[];
        throw err;
      }
    },
  });

  const [rows, setRows] = useState<DepartmentDraft[]>([]);
  const [servicesDept, setServicesDept] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [departmentFormOpen, setDepartmentFormOpen] = useState(false);
  const [departmentForm, setDepartmentForm] =
    useState<DepartmentFormModalState>(emptyDepartmentForm());
  const [editingDepartmentLocalId, setEditingDepartmentLocalId] =
    useState<string | null>(null);

  useEffect(() => {
    if (!tenantDepartmentsQuery.data) return;
    setRows(
      tenantDepartmentsQuery.data.map(mapTenantDepartmentToDraft)
    );
  }, [tenantDepartmentsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (items: DepartmentDraft[]) =>
      tenantsService.replaceTenantDepartments({
        items: items.map((row) => ({
          department_id: row.department_id as number,
          phone_number: nullIfBlank(row.phone_number),
          email: nullIfBlank(row.email),
          location: nullIfBlank(row.location),
        })),
      }),
    onSuccess: (data) => {
      toast.success('Departments updated');
      setRows(data.map(mapTenantDepartmentToDraft));
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.departments,
      });
    },
    onError: (err) => {
      toast.error('Failed to save departments', {
        description: getErrorMessage(err),
      });
    },
  });

  const validateRows = (
    candidateRows: DepartmentDraft[]
  ): boolean => {
    const seen = new Set<number>();
    for (const row of candidateRows) {
      if (!row.department_id) {
        toast.error('Each department row must select a department');
        return false;
      }
      if (seen.has(row.department_id)) {
        toast.error('Duplicate department selected', {
          description:
            'Departments are bulk-replaced; each department can appear only once.',
        });
        return false;
      }
      seen.add(row.department_id);
    }
    return true;
  };

  const persistRows = (candidateRows: DepartmentDraft[]) => {
    if (!validateRows(candidateRows)) return false;
    saveMutation.mutate(candidateRows);
    return true;
  };

  const submitDepartmentModal = () => {
    if (!departmentForm.department_id) {
      toast.error('Please select a department');
      return;
    }
    if (
      rows.some(
        (row) =>
          row.department_id === departmentForm.department_id &&
          row.local_id !== editingDepartmentLocalId
      )
    ) {
      toast.error('Duplicate department selected', {
        description: 'Each department can appear only once.',
      });
      return;
    }
    const selected =
      catalogQuery.data?.find(
        (d) => d.id === departmentForm.department_id
      ) ?? null;
    const nextRows = editingDepartmentLocalId
      ? rows.map((row) =>
          row.local_id === editingDepartmentLocalId
            ? {
                ...row,
                department_id: departmentForm.department_id,
                department_name: selected?.name ?? '',
                phone_number: departmentForm.phone_number,
                email: departmentForm.email,
                location: departmentForm.location,
                isEditing: false,
              }
            : row
        )
      : [
          ...rows,
          {
            local_id: createLocalId(),
            department_id: departmentForm.department_id,
            department_name: selected?.name ?? '',
            phone_number: departmentForm.phone_number,
            email: departmentForm.email,
            location: departmentForm.location,
            isEditing: false,
          },
        ];
    if (!persistRows(nextRows)) return;
    setDepartmentForm(emptyDepartmentForm());
    setEditingDepartmentLocalId(null);
    setDepartmentFormOpen(false);
  };

  const confirmRemoveDepartment = (row: DepartmentDraft) => {
    const deptName = row.department_name || 'selected department';
    openDialog({
      title: 'Remove Department?',
      content: (
        <p className="text-muted-foreground text-sm">
          Remove "{deptName}" from the list? This action saves
          immediately.
        </p>
      ),
      footer: (
        <>
          <Button
            variant="outline"
            disabled={saveMutation.isPending}
            onClick={closeDialog}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={saveMutation.isPending}
            onClick={() => {
              const nextRows = rows.filter(
                (r) => r.local_id !== row.local_id
              );
              if (persistRows(nextRows)) closeDialog();
            }}
          >
            Yes, remove
          </Button>
        </>
      ),
    });
  };

  const loadError =
    catalogQuery.error ?? tenantDepartmentsQuery.error;
  const isLoading =
    catalogQuery.isLoading || tenantDepartmentsQuery.isLoading;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              Departments + Services
            </h1>
            <p className="text-muted-foreground">
              Add, edit, and remove departments. Confirmed actions
              save immediately.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={saveMutation.isPending}
              onClick={() => {
                setEditingDepartmentLocalId(null);
                setDepartmentForm(emptyDepartmentForm());
                setDepartmentFormOpen(true);
              }}
            >
              + Add department
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : loadError ? (
            <p className="text-sm text-destructive">
              {getErrorMessage(loadError)}
            </p>
          ) : (
            <>
              <StandardTable minWidthClass="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="min-w-64">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No departments configured yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const departmentName =
                        catalogQuery.data?.find(
                          (d) => d.id === row.department_id
                        )?.name ||
                        row.department_name ||
                        '-';

                      return (
                        <TableRow key={row.local_id}>
                          <TableCell>
                            <span>{departmentName}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {row.phone_number || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {row.email || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {row.location || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <RowActions>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                  !row.id || saveMutation.isPending
                                }
                                onClick={() =>
                                  row.id
                                    ? setServicesDept({
                                        id: row.id,
                                        name: departmentName,
                                      })
                                    : undefined
                                }
                              >
                                View services
                              </Button>
                              <RowIconActionButton
                                mode="edit"
                                label="Edit department"
                                disabled={saveMutation.isPending}
                                onClick={() => {
                                  setEditingDepartmentLocalId(
                                    row.local_id
                                  );
                                  setDepartmentForm({
                                    department_id: row.department_id,
                                    phone_number: row.phone_number,
                                    email: row.email,
                                    location: row.location,
                                  });
                                  setDepartmentFormOpen(true);
                                }}
                              />
                              <RowIconActionButton
                                mode="delete"
                                label="Remove department"
                                disabled={saveMutation.isPending}
                                onClick={() =>
                                  confirmRemoveDepartment(row)
                                }
                              />
                            </RowActions>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </StandardTable>
              <p className="text-xs text-muted-foreground">
                Departments are saved automatically after Add, Edit,
                and Remove actions.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <ServicesModal
        open={!!servicesDept}
        tenantDepartmentId={servicesDept?.id ?? null}
        departmentName={servicesDept?.name ?? ''}
        onOpenChange={(open) => {
          if (!open) setServicesDept(null);
        }}
        onChanged={() => {
          void queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.departments,
          });
        }}
      />

      <Dialog
        open={departmentFormOpen}
        onOpenChange={(open) => {
          setDepartmentFormOpen(open);
          if (!open) {
            setEditingDepartmentLocalId(null);
            setDepartmentForm(emptyDepartmentForm());
          }
        }}
      >
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDepartmentLocalId
                ? 'Edit Department'
                : 'Add Department'}
            </DialogTitle>
            <DialogDescription>
              {editingDepartmentLocalId
                ? 'Update department details. Confirming this modal saves immediately.'
                : 'Add a department to your tenant. Confirming this modal saves immediately.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <Field className="md:col-span-2">
              <Label htmlFor="dept-modal-select">Department</Label>
              <select
                id="dept-modal-select"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={departmentForm.department_id ?? ''}
                onChange={(e) =>
                  setDepartmentForm((s) => ({
                    ...s,
                    department_id: e.target.value
                      ? Number(e.target.value)
                      : null,
                  }))
                }
              >
                <option value="">Select department</option>
                {(catalogQuery.data ?? []).map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <Label htmlFor="dept-modal-phone">Phone</Label>
              <Input
                id="dept-modal-phone"
                value={departmentForm.phone_number}
                onChange={(e) =>
                  setDepartmentForm((s) => ({
                    ...s,
                    phone_number: e.target.value,
                  }))
                }
                placeholder="+1-555-1001"
              />
            </Field>
            <Field>
              <Label htmlFor="dept-modal-email">Email</Label>
              <Input
                id="dept-modal-email"
                type="email"
                value={departmentForm.email}
                onChange={(e) =>
                  setDepartmentForm((s) => ({
                    ...s,
                    email: e.target.value,
                  }))
                }
                placeholder="dept@clinic.com"
              />
            </Field>
            <Field className="md:col-span-2">
              <Label htmlFor="dept-modal-location">Location</Label>
              <Input
                id="dept-modal-location"
                value={departmentForm.location}
                onChange={(e) =>
                  setDepartmentForm((s) => ({
                    ...s,
                    location: e.target.value,
                  }))
                }
                placeholder="Building A"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saveMutation.isPending}
              onClick={() => {
                setDepartmentFormOpen(false);
                setEditingDepartmentLocalId(null);
                setDepartmentForm(emptyDepartmentForm());
              }}
            >
              Cancel
            </Button>
            <Button
              loading={saveMutation.isPending}
              onClick={submitDepartmentModal}
            >
              {editingDepartmentLocalId
                ? 'Save changes'
                : 'Add department'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ServicesModal({
  open,
  tenantDepartmentId,
  departmentName,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  tenantDepartmentId: number | null;
  departmentName: string;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { open: openDialog, close: closeDialog } = useDialogStore();
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<
    number | null
  >(null);
  const [form, setForm] = useState<ServiceFormState>(
    emptyServiceForm()
  );

  useEffect(() => {
    if (!open) {
      setMode(null);
      setEditingServiceId(null);
      setForm(emptyServiceForm());
    }
  }, [open]);

  const servicesQuery = useQuery({
    queryKey: ['tenant-manager', 'services', tenantDepartmentId],
    queryFn: () =>
      tenantsService.listServices(tenantDepartmentId as number),
    enabled: open && !!tenantDepartmentId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      tenant_department_id: number;
      name: string;
      price: number;
      description?: string | null;
    }) => tenantsService.createService(payload),
    onSuccess: () => {
      toast.success('Service created');
      if (tenantDepartmentId) {
        void queryClient.invalidateQueries({
          queryKey: [
            'tenant-manager',
            'services',
            tenantDepartmentId,
          ],
        });
      }
      onChanged();
      setMode(null);
      setForm(emptyServiceForm());
    },
    onError: (err) => {
      toast.error('Failed to create service', {
        description: getErrorMessage(err),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      serviceId,
      payload,
    }: {
      serviceId: number;
      payload: ServiceUpdateInput;
    }) => tenantsService.updateService(serviceId, payload),
    onSuccess: () => {
      toast.success('Service updated');
      if (tenantDepartmentId) {
        void queryClient.invalidateQueries({
          queryKey: [
            'tenant-manager',
            'services',
            tenantDepartmentId,
          ],
        });
      }
      onChanged();
      setMode(null);
      setEditingServiceId(null);
      setForm(emptyServiceForm());
    },
    onError: (err) => {
      toast.error('Failed to update service', {
        description: getErrorMessage(err),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (serviceId: number) =>
      tenantsService.deleteService(serviceId),
    onSuccess: () => {
      toast.success('Service deleted');
      if (tenantDepartmentId) {
        void queryClient.invalidateQueries({
          queryKey: [
            'tenant-manager',
            'services',
            tenantDepartmentId,
          ],
        });
      }
      onChanged();
      closeDialog();
    },
    onError: (err) => {
      toast.error('Failed to delete service', {
        description: getErrorMessage(err),
      });
    },
  });

  const confirmDeleteService = (service: ServiceLandingItem) => {
    openDialog({
      title: 'Delete Service?',
      content: (
        <p className="text-muted-foreground text-sm">
          Are you sure you want to delete "{service.name}"? This
          action cannot be undone.
        </p>
      ),
      footer: (
        <>
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(service.id)}
          >
            Yes, delete
          </Button>
        </>
      ),
    });
  };

  const startCreate = () => {
    setMode('create');
    setEditingServiceId(null);
    setForm(emptyServiceForm());
  };

  const startEdit = (service: ServiceLandingItem) => {
    setMode('edit');
    setEditingServiceId(service.id);
    setForm({
      name: service.name,
      price: String(service.price ?? ''),
      description: service.description ?? '',
      is_active: service.is_active,
    });
  };

  const closeServiceForm = () => {
    setMode(null);
    setEditingServiceId(null);
    setForm(emptyServiceForm());
  };

  const submit = () => {
    if (!tenantDepartmentId) return;
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) {
      toast.error('Service name is required');
      return;
    }
    if (!Number.isFinite(price)) {
      toast.error('Service price must be a valid number');
      return;
    }

    if (mode === 'create') {
      createMutation.mutate({
        tenant_department_id: tenantDepartmentId,
        name,
        price,
        description: nullIfBlank(form.description),
      });
      return;
    }

    if (mode === 'edit' && editingServiceId) {
      updateMutation.mutate({
        serviceId: editingServiceId,
        payload: {
          name,
          price,
          description: nullIfBlank(form.description),
          is_active: form.is_active,
        },
      });
    }
  };

  const isSubmitting =
    createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {departmentName || 'Department'} Services
          </DialogTitle>
          <DialogDescription>
            Manage services for this department. These changes appear
            under departments on the public landing page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {mode ? (
              <Badge variant="outline">
                {mode === 'create'
                  ? 'Adding service'
                  : 'Editing service'}
              </Badge>
            ) : null}
            <Button
              variant="outline"
              onClick={startCreate}
              disabled={!tenantDepartmentId}
            >
              + Add service
            </Button>
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-lg border">
            <StandardTable minWidthClass="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-0">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8">
                      <Skeleton className="h-12 w-full" />
                    </TableCell>
                  </TableRow>
                ) : servicesQuery.isError ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-destructive"
                    >
                      {getErrorMessage(servicesQuery.error)}
                    </TableCell>
                  </TableRow>
                ) : (servicesQuery.data?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No services yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (servicesQuery.data ?? []).map((service) => (
                    <TableRow key={service.id}>
                      <TableCell className="font-medium">
                        {service.name}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(service.price)}
                      </TableCell>
                      <TableCell className="max-w-sm truncate text-muted-foreground">
                        {service.description || '-'}
                      </TableCell>
                      <TableCell>
                        <RowActions>
                          <RowIconActionButton
                            mode="edit"
                            label="Edit service"
                            onClick={() => startEdit(service)}
                          />
                          <RowIconActionButton
                            mode="delete"
                            label="Delete service"
                            onClick={() =>
                              confirmDeleteService(service)
                            }
                          />
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </StandardTable>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open) closeServiceForm();
        }}
      >
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Add Service' : 'Edit Service'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Create a service for this department.'
                : 'Update service details for this department.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <Label htmlFor="service-name">Name</Label>
              <Input
                id="service-name"
                value={form.name}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    name: e.target.value,
                  }))
                }
                placeholder="Initial Consultation"
              />
            </Field>
            <Field>
              <Label htmlFor="service-price">Price</Label>
              <Input
                id="service-price"
                value={form.price}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    price: e.target.value,
                  }))
                }
                placeholder="120.00"
                inputMode="decimal"
              />
            </Field>
            <Field className="md:col-span-2">
              <Label htmlFor="service-description">Description</Label>
              <textarea
                id="service-description"
                className="border-input bg-background min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    description: e.target.value,
                  }))
                }
                placeholder="First visit assessment"
              />
            </Field>
            <label className="inline-flex items-center gap-2 text-sm md:col-span-2">
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(checked) =>
                  setForm((s) => ({
                    ...s,
                    is_active: checked === true,
                  }))
                }
              />
              Active service
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeServiceForm}>
              Cancel
            </Button>
            <Button onClick={submit} loading={isSubmitting}>
              {mode === 'create' ? 'Create service' : 'Save service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
