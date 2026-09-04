import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type {
  ApprovedTenant,
  EnrollmentDoctor,
} from '@/services/enrollments.service';
import { useApprovedTenants } from '@/services/enrollments.service';
import { useAuthStore } from '@/stores/auth.store';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/appointments/select-tenant')({
  beforeLoad: async () => {
    const { ensureAuth } = useAuthStore.getState();
    await ensureAuth();
  },
  component: SelectTenantPage,
});

function SelectTenantPage() {
  const navigate = useNavigate();
  const {
    data: tenants,
    isLoading,
    isError,
    error,
  } = useApprovedTenants();
  const [selectedTenant, setSelectedTenant] =
    useState<ApprovedTenant | null>(null);

  const handleTenantSelect = (tenant: ApprovedTenant) => {
    setSelectedTenant(tenant);
  };

  const handleDoctorSelect = (
    tenant: ApprovedTenant,
    doctor: EnrollmentDoctor
  ) => {
    useAuthStore.setState({
      tenantId: String(tenant.id),
    });
    navigate({
      to: '/appointments/book',
      search: {
        doctorId: String(doctor.user_id),
      },
    });
  };

  const handleBack = () => {
    setSelectedTenant(null);
  };

  return (
    <div className="w-full">
      {/* Page Header */}
      <div className="border-b bg-linear-to-r from-primary/5 to-transparent py-6 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {selectedTenant ? selectedTenant.name : 'Select a Clinic'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedTenant
              ? 'Choose a doctor to book your appointment'
              : 'Choose a clinic to view available doctors and book an appointment'}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
            <p className="text-muted-foreground">
              Loading clinics...
            </p>
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6">
            <p className="text-sm font-medium text-destructive">
              Failed to load clinics
            </p>
            <p className="mt-1 text-sm text-destructive/80">
              {(error as Error)?.message || 'Please try again later.'}
            </p>
          </div>
        )}

        {/* Tenant Cards Grid */}
        {!isLoading && !isError && tenants && !selectedTenant && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tenants.map((tenant) => (
              <Card
                key={tenant.id}
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md hover:shadow-primary/5"
                onClick={() => handleTenantSelect(tenant)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                      {tenant.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">
                        {tenant.name}
                      </CardTitle>
                      {tenant.moto && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {tenant.moto}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {tenant.doctors.length === 0
                        ? 'No doctors available'
                        : `${tenant.doctors.length} doctor${tenant.doctors.length > 1 ? 's' : ''} available`}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Doctor Selection for Selected Tenant */}
        {!isLoading && !isError && selectedTenant && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-4"
              onClick={handleBack}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="mr-1 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to clinics
            </Button>

            {selectedTenant.doctors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  No Doctors Available
                </h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-md">
                  This clinic doesn't have any doctors available at
                  the moment. Please try another clinic.
                </p>
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={handleBack}
                >
                  Choose Another Clinic
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {selectedTenant.doctors.map((doctor) => (
                  <Card
                    key={doctor.user_id}
                    className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md hover:shadow-primary/5"
                    onClick={() =>
                      handleDoctorSelect(selectedTenant, doctor)
                    }
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {doctor.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {doctor.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {doctor.specialization ||
                              'General Practice'}
                          </p>
                        </div>
                      </div>
                      <Button size="sm">Book Appointment</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
