import { FormField } from '@/components/atoms/form-field';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { isApiError } from '@/lib/api-client';
import { salesLeadsService } from '@/services/sales-leads.service';
import { tenantsService } from '@/services/tenants.service';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

/**
 * Public register route now supports two entry flows:
 * 1) Tenant application (existing platform onboarding path)
 * 2) Consultation request (creates a sales lead path)
 *
 * Consultation flow now uses real backend lead creation endpoint.
 */
export const Route = createFileRoute('/register')({
  component: TenantRegistrationPage,
});

const tenantFormSchema = z.object({
  name: z
    .string()
    .min(2, 'Organization name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  licence_number: z
    .string()
    .min(3, 'Licence number must be at least 3 characters'),
});

type TenantFormValues = z.infer<typeof tenantFormSchema>;

const consultationLeadSchema = z.object({
  organization_name: z
    .string()
    .min(2, 'Organization name must be at least 2 characters'),
  contact_name: z
    .string()
    .min(2, 'Contact name must be at least 2 characters'),
  contact_email: z
    .string()
    .email('Please enter a valid email address'),
  contact_phone: z
    .string()
    .min(6, 'Contact phone must be at least 6 characters'),
  licence_number: z
    .string()
    .min(3, 'Licence number must be at least 3 characters'),
  source: z.string().min(1, 'Source is required'),
  initial_message: z.string().optional(),
});

type ConsultationLeadValues = z.infer<typeof consultationLeadSchema>;

function TenantRegistrationPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = React.useState<string | null>(
    null
  );
  const [consultationError, setConsultationError] = React.useState<
    string | null
  >(null);
  const [activeForm, setActiveForm] = React.useState<
    'application' | 'consultation'
  >('application');
  const [consultationReference, setConsultationReference] =
    React.useState<{
      requestId: string;
      email: string;
      isBackendId: boolean;
    } | null>(null);

  const mutation = useMutation({
    mutationFn: tenantsService.createApplication,
    onSuccess: (data) => {
      toast.success('Application submitted successfully!', {
        description: `Your application is under review. Application ID: ${data.id}`,
      });
      setSubmitError(null);
      form.reset();
      // Navigate to home or confirmation page after 3 seconds
      setTimeout(() => {
        navigate({ to: '/' });
      }, 3000);
    },
    onError: (err) => {
      const errorMessage = isApiError(err)
        ? err.displayMessage
        : (err as Error).message || 'Unknown error';
      setSubmitError(errorMessage);
    },
  });

  const consultationMutation = useMutation({
    mutationFn: salesLeadsService.createPublicLead,
    onSuccess: (data) => {
      setConsultationError(null);
      const values = consultationForm.getValues();

      consultationForm.reset({
        organization_name: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        licence_number: '',
        source: 'WEBSITE',
        initial_message: '',
      });

      // If backend returned a concrete lead id, send requester to public tracking UI.
      const parsedLeadId = Number(data.id);
      const requestIdText = String(parsedLeadId);
      setConsultationReference({
        requestId: requestIdText,
        email: values.contact_email,
        isBackendId: Number.isFinite(parsedLeadId),
      });

      if (Number.isFinite(parsedLeadId)) {
        toast.success('Consultation request submitted!', {
          description: `Your Request ID is ${parsedLeadId}. We will use it to track progress.`,
        });
        navigate({
          to: '/consultation-tracking',
          search: {
            leadId: parsedLeadId,
            requestId: String(parsedLeadId),
            email: values.contact_email,
          },
        });
        return;
      }

      setActiveForm('application');
    },
    onError: (err) => {
      const errorMessage = isApiError(err)
        ? err.displayMessage
        : (err as Error).message || 'Unknown error';
      setConsultationError(errorMessage);
    },
  });

  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantFormSchema),
    defaultValues: {
      name: '',
      email: '',
      licence_number: '',
    },
  });

  const consultationForm = useForm<ConsultationLeadValues>({
    resolver: zodResolver(consultationLeadSchema),
    defaultValues: {
      organization_name: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      licence_number: '',
      source: 'WEBSITE',
      initial_message: '',
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const onSubmit = (data: TenantFormValues) => {
    setSubmitError(null);
    mutation.mutate(data);
  };

  const consultationErrors = consultationForm.formState.errors;

  const onSubmitConsultation = (data: ConsultationLeadValues) => {
    setConsultationError(null);
    setConsultationReference(null);
    consultationMutation.mutate({
      licence_number: data.licence_number,
      organization_name: data.organization_name,
      contact_name: data.contact_name,
      contact_email: data.contact_email,
      contact_phone: data.contact_phone,
      initial_message: data.initial_message || undefined,
      source: data.source,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">
            Join Health Nexus
          </CardTitle>
          <CardDescription>
            Submit your application to join our healthcare platform.
            We'll review your information and get back to you shortly.
          </CardDescription>
          <div className="flex gap-2 pt-2">
            {/* UX toggle between onboarding and consultation lead capture. */}
            <Button
              type="button"
              size="sm"
              variant={
                activeForm === 'application' ? 'default' : 'outline'
              }
              onClick={() => setActiveForm('application')}
            >
              Submit Application
            </Button>
            <Button
              type="button"
              size="sm"
              variant={
                activeForm === 'consultation' ? 'default' : 'outline'
              }
              onClick={() => setActiveForm('consultation')}
            >
              Book Consultation
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeForm === 'application' ? (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-6"
            >
              <FormField
                id="name"
                label="Organization Name"
                error={errors.name?.message}
                placeholder="Your Healthcare Organization"
                {...register('name')}
              />
              <FormField
                id="email"
                label="Contact Email"
                type="email"
                error={errors.email?.message}
                placeholder="contact@yourhospital.com"
                {...register('email')}
              />
              <FormField
                id="licence_number"
                label="Medical Licence Number"
                error={errors.licence_number?.message}
                placeholder="MED-123456"
                {...register('licence_number')}
              />
              <div className="rounded-md border border-primary/30 bg-primary/10 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Prefer to talk first with sales?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open the consultation form and submit your lead
                  directly.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setActiveForm('consultation')}
                  >
                    Book Consultation
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate({
                        to: '/consultation-tracking',
                      })
                    }
                  >
                    Track Existing Request
                  </Button>
                </div>
              </div>
              {submitError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {submitError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate({ to: '/' })}
                  disabled={mutation.isPending}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1"
                >
                  {mutation.isPending
                    ? 'Submitting...'
                    : 'Submit Application'}
                </Button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={consultationForm.handleSubmit(
                onSubmitConsultation
              )}
              className="space-y-4"
            >
              {consultationReference ? (
                <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3">
                  <p className="text-sm font-semibold text-foreground">
                    Request submitted successfully
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your Request ID:{' '}
                    <span className="font-semibold text-foreground">
                      {consultationReference.requestId}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Keep this Request ID and email (
                    {consultationReference.email}) to track progress.
                  </p>
                  {!consultationReference.isBackendId ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      This is a temporary reference until backend
                      tracking id is available.
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate({
                          to: '/consultation-tracking',
                          search: consultationReference.isBackendId
                            ? {
                                leadId: Number(
                                  consultationReference.requestId
                                ),
                                requestId:
                                  consultationReference.requestId,
                                email: consultationReference.email,
                              }
                            : {
                                requestId:
                                  consultationReference.requestId,
                                email: consultationReference.email,
                              },
                        })
                      }
                    >
                      Open Tracking Page
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  Track your journey
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  After submitting, keep your Request ID and contact
                  email. You can use both on the tracking page to
                  follow your consultation progress.
                </p>
              </div>
              <FormField
                id="organization_name"
                label="Organization Name"
                error={consultationErrors.organization_name?.message}
                placeholder="Your Healthcare Organization"
                wrapperClassName="space-y-1"
                className="h-9 text-sm"
                {...consultationForm.register('organization_name')}
              />
              <FormField
                id="contact_name"
                label="Contact Name"
                error={consultationErrors.contact_name?.message}
                placeholder="Full name"
                wrapperClassName="space-y-1"
                className="h-9 text-sm"
                {...consultationForm.register('contact_name')}
              />
              <FormField
                id="contact_email"
                label="Contact Email"
                type="email"
                error={consultationErrors.contact_email?.message}
                placeholder="contact@yourhospital.com"
                wrapperClassName="space-y-1"
                className="h-9 text-sm"
                {...consultationForm.register('contact_email')}
              />
              <FormField
                id="contact_phone"
                label="Contact Phone"
                error={consultationErrors.contact_phone?.message}
                placeholder="+1 555 123 4567"
                wrapperClassName="space-y-1"
                className="h-9 text-sm"
                {...consultationForm.register('contact_phone')}
              />
              <FormField
                id="consultation_licence_number"
                label="Medical Licence Number"
                error={consultationErrors.licence_number?.message}
                placeholder="MED-123456"
                wrapperClassName="space-y-1"
                className="h-9 text-sm"
                {...consultationForm.register('licence_number')}
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="initial_message"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Initial Message (optional)
                </label>
                <Textarea
                  id="initial_message"
                  placeholder="Tell us what you need from the consultation."
                  className="min-h-16 text-sm"
                  {...consultationForm.register('initial_message')}
                />
                {consultationErrors.initial_message?.message ? (
                  <p className="text-xs text-destructive">
                    {consultationErrors.initial_message.message}
                  </p>
                ) : null}
              </div>
              {consultationError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {consultationError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveForm('application')}
                  disabled={consultationMutation.isPending}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={consultationMutation.isPending}
                  className="flex-1"
                >
                  {consultationMutation.isPending
                    ? 'Submitting...'
                    : 'Submit Consultation Request'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
