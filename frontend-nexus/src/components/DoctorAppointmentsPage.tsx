import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useDoctorAppointments } from '@/services/appointments.doctor';
import {
  useApproveAppointment,
  useCompleteAppointment,
  useRejectAppointment,
} from '@/services/appointments.doctor.mutations';
import { useGenerateOffers } from '@/services/offers.queries';
import { useCreateRecommendation } from '@/services/recommendations.queries';
import {
  RECOMMENDATION_CATEGORIES,
  type RecommendationCategory,
} from '@/services/recommendations.service';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Strip timezone suffix (Z, +00:00, -05:00, etc.) so JS parses as local.
 * This keeps displayed times consistent with what the patient saw when booking.
 * @param iso ISO date string
 * @returns Date object in local time
 */
function toNaiveDate(iso: string): Date {
  return new Date(
    iso.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '')
  );
}

// Number of appointments per page in each tab
const PAGE_SIZE = 3;
// Default recommendation category for dialog
const DEFAULT_CATEGORY: RecommendationCategory = 'CARE_PLAN';

/**
 * Pagination component for appointment lists.
 * Shows page controls if more than one page.
 */
function Pagination({
  total,
  page,
  onPageChange,
}: {
  total: number;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

/**
 * DoctorAppointmentsPage displays all appointments for a doctor, grouped by status.
 * Allows approving, rejecting, completing appointments, and generating offers for completed appointments.
 * Includes a dialog for creating recommendations and generating offers.
 */
export default function DoctorAppointmentsPage() {
  // Fetch appointments and mutations
  const { data, isLoading, isError, error } = useDoctorAppointments();
  const approveMutation = useApproveAppointment();
  const completeMutation = useCompleteAppointment();
  const rejectMutation = useRejectAppointment();
  const generateOffersMutation = useGenerateOffers();
  const createRecommendationMutation = useCreateRecommendation();

  // Pagination state for each tab
  const [requestedPage, setRequestedPage] = useState(1);
  const [confirmedPage, setConfirmedPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);

  // Recommendation dialog state
  const [
    recommendationAppointmentId,
    setRecommendationAppointmentId,
  ] = useState<number | null>(null);
  const [recommendationCategory, setRecommendationCategory] =
    useState<RecommendationCategory>(DEFAULT_CATEGORY);
  const [recommendationType, setRecommendationType] = useState('');

  // Loading and error states
  if (isLoading) return <div className="p-8">Loading...</div>;
  if (isError)
    return (
      <div className="p-8 text-red-500">
        {(error as Error)?.message || 'Error loading appointments'}
      </div>
    );

  // Filter appointments by status
  const requested =
    data?.filter((a) => a.status === 'REQUESTED') ?? [];
  const confirmed =
    data?.filter((a) => a.status === 'CONFIRMED') ?? [];
  const completed =
    data?.filter((a) => a.status === 'COMPLETED') ?? [];
  const recommendationAppointment =
    completed.find((a) => a.id === recommendationAppointmentId) ??
    null;

  // Reset recommendation dialog state
  const resetRecommendationDialog = () => {
    setRecommendationAppointmentId(null);
    setRecommendationCategory(DEFAULT_CATEGORY);
    setRecommendationType('');
  };

  // Main UI: tabs for each appointment status
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      {/* Appointment status tabs */}
      <Tabs defaultValue="REQUESTED" className="w-full">
        <TabsList>
          <TabsTrigger value="REQUESTED">
            Requested ({requested.length})
          </TabsTrigger>
          <TabsTrigger value="CONFIRMED">
            Confirmed ({confirmed.length})
          </TabsTrigger>
          <TabsTrigger value="COMPLETED">
            Completed ({completed.length})
          </TabsTrigger>
        </TabsList>
        {/* Requested appointments tab */}
        <TabsContent value="REQUESTED">
          <div className="flex flex-col gap-4 mt-4">
            {requested.length === 0 && (
              <span>No requested appointments.</span>
            )}
            {requested
              .slice(
                (requestedPage - 1) * PAGE_SIZE,
                requestedPage * PAGE_SIZE
              )
              .map((appt) => {
                // Approve/reject button loading states
                const isApproving =
                  approveMutation.isPending &&
                  approveMutation.variables === appt.id;
                const isRejecting =
                  rejectMutation.isPending &&
                  rejectMutation.variables === appt.id;
                return (
                  <Card key={appt.id} className="border-border">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{appt.patient_name}</CardTitle>
                      <StatusBadge status={appt.status} />
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <span>
                        Date:{' '}
                        {format(
                          toNaiveDate(appt.appointment_datetime),
                          'PPpp'
                        )}
                      </span>
                      {appt.description && (
                        <span className="text-muted-foreground">
                          Note: {appt.description}
                        </span>
                      )}
                      <div className="flex gap-2 mt-2">
                        {/* Approve button */}
                        <Button
                          variant="default"
                          disabled={isApproving || isRejecting}
                          onClick={async () => {
                            if (appt.status !== 'REQUESTED') return;
                            try {
                              await approveMutation.mutateAsync(
                                appt.id
                              );
                              toast.success('Appointment approved');
                            } catch (err: any) {
                              toast.error(
                                err?.message || 'Failed to approve'
                              );
                            }
                          }}
                        >
                          {isApproving ? 'Approving...' : 'Approve'}
                        </Button>
                        {/* Reject button */}
                        <Button
                          variant="outline"
                          disabled={isApproving || isRejecting}
                          className="border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={async () => {
                            if (appt.status !== 'REQUESTED') return;
                            try {
                              await rejectMutation.mutateAsync(
                                appt.id
                              );
                              toast.success(
                                'Appointment rejected — slot is now available again'
                              );
                            } catch (err: any) {
                              toast.error(
                                err?.message || 'Failed to reject'
                              );
                            }
                          }}
                        >
                          {isRejecting ? 'Rejecting...' : 'Reject'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            <Pagination
              total={requested.length}
              page={requestedPage}
              onPageChange={setRequestedPage}
            />
          </div>
        </TabsContent>
        {/* Confirmed appointments tab */}
        <TabsContent value="CONFIRMED">
          <div className="flex flex-col gap-4 mt-4">
            {confirmed.length === 0 && (
              <span>No confirmed appointments.</span>
            )}
            {confirmed
              .slice(
                (confirmedPage - 1) * PAGE_SIZE,
                confirmedPage * PAGE_SIZE
              )
              .map((appt) => {
                // Complete button loading state
                const isCompleting =
                  completeMutation.isPending &&
                  completeMutation.variables === appt.id;
                return (
                  <Card key={appt.id}>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{appt.patient_name}</CardTitle>
                      <StatusBadge status={appt.status} />
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <span>
                        Date:{' '}
                        {format(
                          toNaiveDate(appt.appointment_datetime),
                          'PPpp'
                        )}
                      </span>
                      {appt.description && (
                        <span className="text-muted-foreground">
                          Note: {appt.description}
                        </span>
                      )}
                      <div className="flex gap-2 mt-2">
                        {/* Complete button */}
                        <Button
                          variant="default"
                          disabled={isCompleting}
                          onClick={async () => {
                            if (appt.status !== 'CONFIRMED') return;
                            try {
                              await completeMutation.mutateAsync(
                                appt.id
                              );
                              toast.success('Appointment completed');
                            } catch (err: any) {
                              toast.error(
                                err?.message || 'Failed to complete'
                              );
                            }
                          }}
                        >
                          {isCompleting
                            ? 'Completing...'
                            : 'Complete'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            <Pagination
              total={confirmed.length}
              page={confirmedPage}
              onPageChange={setConfirmedPage}
            />
          </div>
        </TabsContent>
        {/* Completed appointments tab */}
        <TabsContent value="COMPLETED">
          <div className="mt-4 flex flex-col gap-4">
            {completed.length === 0 && (
              <span>No completed appointments.</span>
            )}
            {completed
              .slice(
                (completedPage - 1) * PAGE_SIZE,
                completedPage * PAGE_SIZE
              )
              .map((appt) => {
                // Dialog open state for this appointment
                const isOpeningCurrentDialog =
                  recommendationAppointmentId === appt.id;
                return (
                  <Card key={appt.id}>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{appt.patient_name}</CardTitle>
                      <StatusBadge status={appt.status} />
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <span>
                        Date:{' '}
                        {format(
                          toNaiveDate(appt.appointment_datetime),
                          'PPpp'
                        )}
                      </span>
                      {appt.description && (
                        <span className="text-muted-foreground">
                          Note: {appt.description}
                        </span>
                      )}
                      <div className="mt-2 flex gap-2">
                        {/* Generate offer button */}
                        <Button
                          variant="default"
                          disabled={isOpeningCurrentDialog}
                          onClick={() => {
                            setRecommendationAppointmentId(appt.id);
                            setRecommendationCategory(
                              DEFAULT_CATEGORY
                            );
                            setRecommendationType('');
                          }}
                        >
                          {isOpeningCurrentDialog
                            ? 'Generate Offer Open'
                            : 'Generate Offer'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            <Pagination
              total={completed.length}
              page={completedPage}
              onPageChange={setCompletedPage}
            />
          </div>
        </TabsContent>
      </Tabs>
      {/* Recommendation dialog for completed appointments */}
      <Dialog
        open={recommendationAppointmentId !== null}
        onOpenChange={(open) => {
          if (!open) {
            resetRecommendationDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Recommendation</DialogTitle>
            <DialogDescription>
              Add an approved recommendation for this completed
              appointment and generate the client offer immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="recommendation-category">
                Category
              </Label>
              <Select
                value={recommendationCategory}
                onValueChange={(value) =>
                  setRecommendationCategory(
                    value as RecommendationCategory
                  )
                }
              >
                <SelectTrigger
                  className="w-full"
                  id="recommendation-category"
                >
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {RECOMMENDATION_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category.replaceAll('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recommendation-type">
                Recommendation
              </Label>
              <Input
                id="recommendation-type"
                value={recommendationType}
                placeholder="Nutrition care plan"
                onChange={(event) =>
                  setRecommendationType(event.target.value)
                }
              />
            </div>
            {recommendationAppointment ? (
              <p className="text-sm text-muted-foreground">
                Appointment #{recommendationAppointment.id} for{' '}
                {recommendationAppointment.patient_name}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            {/* Cancel button */}
            <Button
              variant="outline"
              onClick={resetRecommendationDialog}
              disabled={
                createRecommendationMutation.isPending ||
                generateOffersMutation.isPending
              }
            >
              Cancel
            </Button>
            {/* Generate offer button */}
            <Button
              disabled={
                !recommendationAppointment ||
                !recommendationType.trim() ||
                createRecommendationMutation.isPending ||
                generateOffersMutation.isPending
              }
              onClick={async () => {
                if (!recommendationAppointment) return;
                try {
                  await createRecommendationMutation.mutateAsync({
                    appointment_id: recommendationAppointment.id,
                    category: recommendationCategory,
                    recommendation_type: recommendationType.trim(),
                    approved: true,
                  });
                  const result =
                    await generateOffersMutation.mutateAsync({
                      appointment_id: recommendationAppointment.id,
                      delivery_channel: 'IN_APP',
                    });
                  if (result.created_count > 0) {
                    toast.success(
                      `Offer generated for ${recommendationAppointment.patient_name}`
                    );
                  } else if (result.existing_count > 0) {
                    toast.success(
                      `Offer already exists for ${recommendationAppointment.patient_name}`
                    );
                  } else {
                    toast.info(
                      'Recommendation saved, but no offer was generated'
                    );
                  }
                  resetRecommendationDialog();
                } catch {
                  // handled by mutations
                }
              }}
            >
              {createRecommendationMutation.isPending ||
              generateOffersMutation.isPending
                ? 'Saving...'
                : 'Generate Offer for Patient'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
