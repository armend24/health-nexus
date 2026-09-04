import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DoctorRead } from '@/interfaces';
import { isApiError } from '@/lib/api-client';
import { tenantsService } from '@/services/tenants.service';
import { useDialogStore } from '@/stores/use-dialog-store';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { QUERY_KEYS } from '../-constants';
import {
  RowActions,
  RowIconActionButton,
  StandardTable,
} from '../-shared';
import { formatDate, getErrorMessage } from '../-utils';
import { DoctorForm } from './components/-doctor-form';

interface DoctorsManagerProps {
  tenantId: number;
}

export function DoctorsManager({ tenantId }: DoctorsManagerProps) {
  const queryClient = useQueryClient();
  const { open: openDialog, close: closeDialog } = useDialogStore();

  const doctorsQuery = useQuery({
    queryKey: QUERY_KEYS.doctors,
    queryFn: async () => {
      try {
        return await tenantsService.listTenantDoctors();
      } catch (err) {
        if (isApiError(err) && err.status === 404)
          return [] as DoctorRead[];
        throw err;
      }
    },
  });
  const doctors = doctorsQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (userId: number) =>
      tenantsService.deleteTenantDoctor(userId),
    onSuccess: () => {
      toast.success('Doctor removed');
      closeDialog();
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.doctors,
      });
    },
    onError: (err) => {
      toast.error(
        isApiError(err)
          ? err.displayMessage
          : 'Failed to remove doctor'
      );
    },
  });

  const openAddDialog = () => {
    openDialog({
      title: 'Add doctor',
      content: <DoctorForm mode="create" tenantId={tenantId} />,
    });
  };

  const openEditDialog = (doctor: DoctorRead) => {
    openDialog({
      title: 'Edit doctor',
      content: (
        <DoctorForm mode="edit" tenantId={tenantId} doctor={doctor} />
      ),
    });
  };

  const confirmRemoveDoctor = (doctor: DoctorRead) => {
    const name =
      [doctor.first_name, doctor.last_name]
        .filter(Boolean)
        .join(' ') || `Doctor #${doctor.user_id}`;
    openDialog({
      title: 'Remove doctor',
      content: (
        <p className="text-muted-foreground text-sm">
          Remove {name} from this tenant? This cannot be undone.
        </p>
      ),
      footer: (
        <>
          <Button
            variant="outline"
            disabled={deleteMutation.isPending}
            onClick={closeDialog}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate(doctor.user_id)}
            disabled={deleteMutation.isPending}
          >
            Remove
          </Button>
        </>
      ),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Doctors</h1>
          <p className="text-muted-foreground">
            Add, edit, and remove doctors assigned to this tenant.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openAddDialog}>+ Add doctor</Button>
        </div>
      </CardHeader>
      <CardContent>
        {doctorsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : doctorsQuery.isError ? (
          <p className="text-sm text-destructive">
            {getErrorMessage(doctorsQuery.error)}
          </p>
        ) : (
          <>
            {doctors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No doctors assigned yet.
              </p>
            ) : (
              <StandardTable minWidthClass="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead>Licence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="min-w-24">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doctors.map((doctor) => (
                    <TableRow key={doctor.user_id}>
                      <TableCell>
                        {[doctor.first_name, doctor.last_name]
                          .filter(Boolean)
                          .join(' ') || `Doctor #${doctor.user_id}`}
                      </TableCell>
                      <TableCell>
                        {doctor.specialization || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {doctor.licence_number || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            doctor.is_active ? 'success' : 'neutral'
                          }
                        >
                          {doctor.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(doctor.created_at)}
                      </TableCell>
                      <TableCell>
                        <RowActions>
                          <RowIconActionButton
                            mode="edit"
                            label="Edit doctor"
                            onClick={() => openEditDialog(doctor)}
                          />
                          <RowIconActionButton
                            mode="delete"
                            label="Remove doctor"
                            onClick={() =>
                              confirmRemoveDoctor(doctor)
                            }
                          />
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </StandardTable>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
