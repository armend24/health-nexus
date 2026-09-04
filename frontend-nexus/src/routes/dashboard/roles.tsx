import { FormField } from '@/components/atoms/form-field';
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
import type { Role } from '@/interfaces';
import { API_BASE_URL, isApiError } from '@/lib/api-client';
import { requireAuth } from '@/lib/guards/requireAuth';
import { rolesService } from '@/services';
import { useDialogStore } from '@/stores/use-dialog-store';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export const Route = createFileRoute('/dashboard/roles')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_ROLES',
  }),
  component: RolesPage,
});

const ROLES_QUERY_KEY = ['roles'];

const roleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});
type RoleFormValues = z.infer<typeof roleSchema>;

function RolesPage() {
  const queryClient = useQueryClient();
  const dialog = useDialogStore();

  const {
    data: roles = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: () => rolesService.list({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: rolesService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ROLES_QUERY_KEY,
      });
      dialog.close();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: { name?: string };
    }) => rolesService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ROLES_QUERY_KEY,
      });
      dialog.close();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: rolesService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ROLES_QUERY_KEY,
      });
      dialog.close();
    },
  });

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '' },
  });

  const openCreateDialog = () => {
    form.reset({ name: '' });
    dialog.open({
      title: 'Create role',
      content: (
        <RoleForm
          form={form}
          onSubmit={(v) => createMutation.mutate(v)}
          error={createMutation.error}
        />
      ),
      footer: (
        <>
          <Button variant="outline" onClick={dialog.close}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((v) =>
              createMutation.mutate(v)
            )}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </>
      ),
    });
  };

  const openEditDialog = (role: Role) => {
    form.reset({ name: role.name });
    dialog.open({
      title: 'Edit role',
      content: (
        <RoleForm
          form={form}
          onSubmit={(v) =>
            updateMutation.mutate({
              id: role.id,
              data: v,
            })
          }
          error={updateMutation.error}
        />
      ),
      footer: (
        <>
          <Button variant="outline" onClick={dialog.close}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((v) =>
              updateMutation.mutate({
                id: role.id,
                data: v,
              })
            )}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </>
      ),
    });
  };

  const openDeleteDialog = (role: Role) => {
    dialog.open({
      title: 'Delete role',
      content: (
        <p className="text-muted-foreground">
          Are you sure you want to delete &quot;
          {role.name}&quot;? This cannot be undone.
        </p>
      ),
      footer: (
        <>
          <Button variant="outline" onClick={dialog.close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate(role.id)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </>
      ),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-8 p-8">
        <div>
          <h1 className="text-3xl font-bold">Roles</h1>
          <p className="mt-2 text-muted-foreground">
            Manage roles from the backend API
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold">Roles</h1>
        <p className="mt-4 text-destructive">
          {isApiError(error)
            ? error.displayMessage
            : (error?.message ?? 'Failed to load roles')}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ensure the backend is running at {API_BASE_URL}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Roles</h1>
          <p className="mt-2 text-muted-foreground">
            {roles.length} roles — CRUD via backend API
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
          <Button onClick={openCreateDialog}>Create role</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All roles</CardTitle>
          <CardDescription>
            List, create, edit, and delete roles. Changes hit the
            backend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No roles yet. Create one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-mono text-muted-foreground">
                      {role.id}
                    </TableCell>
                    <TableCell className="font-medium">
                      {role.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(role.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(role)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(role)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RoleForm({
  form,
  onSubmit,
  error,
}: {
  form: ReturnType<typeof useForm<RoleFormValues>>;
  onSubmit: (v: RoleFormValues) => void;
  error: unknown;
}) {
  const {
    register,
    formState: { errors },
  } = form;
  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <FormField
        id="name"
        label="Name"
        placeholder="e.g. Admin"
        error={errors.name?.message}
        {...register('name')}
      />
      {error ? (
        <p className="text-sm text-destructive">
          {isApiError(error)
            ? error.displayMessage
            : (error as Error).message}
        </p>
      ) : null}
    </form>
  );
}
