/**
 * RegisterPatientDialog: shadcn Dialog wrapping a short patient-registration form.
 *
 * Props:
 *  - tenantId   : numeric id from landingData.tenant.id
 *  - userEmail  : email from the auth store (must not be empty)
 *  - open / onOpenChange : controlled dialog state
 *  - onRegistered : called on 201 success or 409 (already registered) so parent can disable button
 */
import { FormField } from '@/components/atoms/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isApiError } from '@/lib/api-client';
import { clientsService } from '@/services/clients.service';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

// ─── Schema ───────────────────────────────────────────────────────────────────

const patientSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  birthdate: z.string().optional(),
  gender: z.string().optional(),
  blood_type: z.string().optional(),
});

type PatientValues = z.infer<typeof patientSchema>;

// ─── Constants ─────────────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  {
    value: 'prefer_not_to_say',
    label: 'Prefer not to say',
  },
];

const BLOOD_TYPE_OPTIONS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
];

// ─── Component ─────────────────────────────────────────────────────────────────

export interface RegisterPatientDialogProps {
  tenantId: number;
  userEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
}

export function RegisterPatientDialog({
  tenantId,
  userEmail,
  open,
  onOpenChange,
  onRegistered,
}: RegisterPatientDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PatientValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      birthdate: '',
      gender: '',
      blood_type: '',
    },
  });

  const onSubmit = async (values: PatientValues) => {
    setIsSubmitting(true);
    try {
      await clientsService.registerAsPatient(tenantId, {
        email: userEmail,
        first_name: values.first_name,
        last_name: values.last_name,
        birthdate: values.birthdate || null,
        gender: values.gender || null,
        blood_type: values.blood_type || null,
      });
      toast.success('Registered in this tenant', {
        description:
          'You are now a patient at this healthcare organization.',
      });
      form.reset();
      onOpenChange(false);
      onRegistered();
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        toast.error('Already registered in this tenant', {
          description: 'Your account is already a patient here.',
        });
        onOpenChange(false);
        onRegistered();
      } else if (isApiError(err) && err.status === 403) {
        toast.error('Access denied', {
          description:
            'This tenant is not accepting registrations or your account is not permitted.',
        });
        // keep dialog open
      } else if (isApiError(err) && err.status === 404) {
        toast.error('Tenant not found', {
          description:
            'This healthcare organization could not be found.',
        });
        // keep dialog open
      } else {
        toast.error('Registration failed', {
          description: isApiError(err)
            ? err.displayMessage
            : 'Please try again.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Register as a patient</DialogTitle>
          <DialogDescription>
            Registering as{' '}
            <span className="font-medium text-foreground">
              {userEmail}
            </span>
            . Fill in your details to become a patient at this
            organization.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4 py-2"
        >
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="patient-first-name"
              label="First name"
              autoComplete="given-name"
              error={form.formState.errors.first_name?.message}
              required
              {...form.register('first_name')}
            />
            <FormField
              id="patient-last-name"
              label="Last name"
              autoComplete="family-name"
              error={form.formState.errors.last_name?.message}
              required
              {...form.register('last_name')}
            />
          </div>

          {/* Birthdate */}
          <FormField
            id="patient-birthdate"
            label="Date of birth"
            type="date"
            error={form.formState.errors.birthdate?.message}
            {...form.register('birthdate')}
          />

          {/* Gender */}
          <div className="space-y-2">
            <Label htmlFor="patient-gender">Gender</Label>
            <Select
              value={form.watch('gender') ?? ''}
              onValueChange={(val) =>
                form.setValue('gender', val, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="patient-gender">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Blood type */}
          <div className="space-y-2">
            <Label htmlFor="patient-blood-type">Blood type</Label>
            <Select
              value={form.watch('blood_type') ?? ''}
              onValueChange={(val) =>
                form.setValue('blood_type', val, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="patient-blood-type">
                <SelectValue placeholder="Select blood type" />
              </SelectTrigger>
              <SelectContent>
                {BLOOD_TYPE_OPTIONS.map((bt) => (
                  <SelectItem key={bt} value={bt}>
                    {bt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Register
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
