import { FormField } from '@/components/atoms/form-field';
import { Button } from '@/components/ui/button';
import type { TenantCreate } from '@/interfaces';
import { isApiError } from '@/lib/api-client';
import { tenantsService } from '@/services/tenants.service';
import { useDialogStore } from '@/stores/use-dialog-store';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { TENANTS_QUERY_KEY } from './-constants';

const tenantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name must be 255 characters or less'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(255, 'Email must be 255 characters or less'),
  licence_number: z
    .string()
    .trim()
    .min(1, 'Licence number is required')
    .max(255, 'Licence number must be 255 characters or less'),
});

type TenantFormValues = z.infer<typeof tenantSchema>;

const DEFAULTS: TenantFormValues = {
  name: '',
  email: '',
  licence_number: '',
};

export function TenantForm() {
  const queryClient = useQueryClient();
  const dialog = useDialogStore();

  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    mode: 'onSubmit',
    defaultValues: DEFAULTS,
    shouldFocusError: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: TenantCreate) =>
      tenantsService.createApplication(data),
    onSuccess: (data) => {
      toast.success('Application submitted', {
        description: `"${data.name}" has been added. Application ID: ${data.id}`,
      });
      queryClient.invalidateQueries({
        queryKey: [...TENANTS_QUERY_KEY],
      });
      dialog.close();
    },
    onError: (err) => {
      toast.error('Failed to submit application', {
        description: isApiError(err)
          ? err.displayMessage
          : (err as Error).message,
      });
    },
  });

  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
      className="space-y-4"
    >
      <FormField
        id="name"
        label="Organization Name"
        placeholder="Your Healthcare Organization"
        error={errors.name?.message}
        required
        {...register('name')}
      />
      <FormField
        id="email"
        label="Contact Email"
        type="email"
        placeholder="contact@yourhospital.com"
        error={errors.email?.message}
        required
        {...register('email')}
      />
      <FormField
        id="licence_number"
        label="Medical Licence Number"
        placeholder="MED-123456"
        error={errors.licence_number?.message}
        required
        {...register('licence_number')}
      />
      {createMutation.error ? (
        <p className="text-sm text-destructive">
          {isApiError(createMutation.error)
            ? createMutation.error.displayMessage
            : (createMutation.error as Error).message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={dialog.close}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Creating...' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
