import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { isApiError } from '@/lib/api-client';
import {
  type ConsultationStatus,
  type SalesConsultationListItem,
  useCreateLeadConsultation,
  useTransitionConsultation,
  useUpdateLeadFollowUp,
  useTransitionLead,
} from '@/services/sales-leads.service';
import { useNavigate } from '@tanstack/react-router';
import {
  CalendarClock,
  Link as LinkIcon,
  MapPin,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

function ConsultationStatusPill({
  status,
}: {
  status: ConsultationStatus;
}) {
  const statusClassByStatus: Record<ConsultationStatus, string> = {
    SCHEDULED:
      'border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/12 dark:text-sky-200',
    COMPLETED:
      'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/12 dark:text-emerald-200',
    NO_SHOW:
      'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/12 dark:text-amber-200',
    CANCELLED:
      'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/12 dark:text-rose-200',
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClassByStatus[status]}`}
    >
      {status}
    </span>
  );
}

function formatConsultationTime(value: string) {
  return new Date(value).toLocaleString();
}

function buildNoShowFollowUpDeadline() {
  const due = new Date();
  due.setHours(due.getHours() + 24);
  return due;
}

export function SalesConsultationsPanel({
  consultations,
  isLoading,
  isError,
  emptyMessage,
  showLeadContext = true,
  actionEnabled = true,
}: {
  consultations: SalesConsultationListItem[];
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage: string;
  showLeadContext?: boolean;
  actionEnabled?: boolean;
}) {
  const transitionConsultation = useTransitionConsultation();
  const createLeadConsultation = useCreateLeadConsultation();
  const updateLeadFollowUp = useUpdateLeadFollowUp();
  const transitionLead = useTransitionLead();
  const navigate = useNavigate();
  const [cancelTarget, setCancelTarget] =
    useState<SalesConsultationListItem | null>(null);
  const [rescheduleTarget, setRescheduleTarget] =
    useState<SalesConsultationListItem | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [rescheduleScheduledAt, setRescheduleScheduledAt] =
    useState('');
  const [rescheduleDuration, setRescheduleDuration] = useState('45');
  const [rescheduleLocation, setRescheduleLocation] =
    useState('Google Meet');
  const [rescheduleMeetingLink, setRescheduleMeetingLink] =
    useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const isSubmittingCancel =
    transitionConsultation.isPending && cancelTarget !== null;
  const isSubmittingReschedule =
    createLeadConsultation.isPending ||
    transitionConsultation.isPending ||
    transitionLead.isPending;

  const scheduledCount = useMemo(
    () =>
      consultations.filter(
        (consultation) => consultation.status === 'SCHEDULED'
      ).length,
    [consultations]
  );

  const handleStatusUpdate = async (
    consultationId: number,
    newStatus: 'COMPLETED' | 'NO_SHOW'
  ) => {
    const consultation = consultations.find(
      (item) => item.id === consultationId
    );
    if (!consultation) {
      toast.error('Consultation not found in the current view.');
      return;
    }

    try {
      await transitionConsultation.mutateAsync({
        consultationId,
        payload: { new_status: newStatus },
      });
      if (newStatus === 'NO_SHOW') {
        const dueAt = buildNoShowFollowUpDeadline();
        await updateLeadFollowUp.mutateAsync({
          leadId: consultation.lead_id,
          payload: {
            next_action:
              'Follow up after consultation no-show and offer a reschedule.',
            next_action_due_at: dueAt.toISOString(),
          },
        });
        await transitionLead.mutateAsync({
          leadId: consultation.lead_id,
          nextStatus: 'CONTACTED',
          reason:
            'Consultation marked as no-show. Lead returned to CONTACTED for follow-up and rescheduling.',
        });
        toast.success(
          `Consultation marked NO_SHOW. Follow-up due ${dueAt.toLocaleString()}.`
        );
        return;
      }
      toast.success(`Consultation marked ${newStatus}`);
    } catch (error) {
      toast.error(
        isApiError(error)
          ? error.displayMessage
          : error instanceof Error
            ? error.message
            : 'Failed to update consultation'
      );
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const rejectionReason =
      cancellationReason.trim() ||
      'Consultation was cancelled by sales and the lead was closed.';
    try {
      await transitionConsultation.mutateAsync({
        consultationId: cancelTarget.id,
        payload: {
          new_status: 'CANCELLED',
          cancellation_reason: cancellationReason.trim() || undefined,
          cancelled_by_actor: 'SALES',
        },
      });
      await transitionLead.mutateAsync({
        leadId: cancelTarget.lead_id,
        nextStatus: 'REJECTED',
        reason: rejectionReason,
      });
      toast.success('Consultation cancelled');
      setCancelTarget(null);
      setCancellationReason('');
    } catch (error) {
      toast.error(
        isApiError(error)
          ? error.displayMessage
          : error instanceof Error
            ? error.message
            : 'Failed to cancel consultation'
      );
    }
  };

  const openRescheduleDialog = (
    consultation: SalesConsultationListItem
  ) => {
    setRescheduleTarget(consultation);
    setRescheduleScheduledAt(
      new Date(consultation.scheduled_at).toISOString().slice(0, 16)
    );
    setRescheduleDuration(String(consultation.duration_minutes));
    setRescheduleLocation(consultation.location || 'Google Meet');
    setRescheduleMeetingLink(consultation.meeting_link || '');
    setRescheduleReason('');
  };

  const resetRescheduleDialog = () => {
    setRescheduleTarget(null);
    setRescheduleScheduledAt('');
    setRescheduleDuration('45');
    setRescheduleLocation('Google Meet');
    setRescheduleMeetingLink('');
    setRescheduleReason('');
  };

  const handleReschedule = async () => {
    if (!rescheduleTarget) return;
    if (!rescheduleScheduledAt.trim()) {
      toast.error('New consultation date and time are required.');
      return;
    }
    if (!rescheduleLocation.trim()) {
      toast.error('Location is required for reschedule.');
      return;
    }

    try {
      if (rescheduleTarget.status === 'SCHEDULED') {
        await transitionConsultation.mutateAsync({
          consultationId: rescheduleTarget.id,
          payload: {
            new_status: 'CANCELLED',
            cancellation_reason:
              rescheduleReason.trim() ||
              'Consultation rescheduled by sales.',
            cancelled_by_actor: 'SALES',
          },
        });
      }

      await createLeadConsultation.mutateAsync({
        leadId: rescheduleTarget.lead_id,
        payload: {
          scheduled_at: new Date(rescheduleScheduledAt).toISOString(),
          duration_minutes: Math.max(
            15,
            Number(rescheduleDuration) || 45
          ),
          location: rescheduleLocation.trim(),
          meeting_link: rescheduleMeetingLink.trim() || undefined,
        },
      });

      if (
        rescheduleTarget.lead?.status !== 'CONSULTATION_SCHEDULED'
      ) {
        await transitionLead.mutateAsync({
          leadId: rescheduleTarget.lead_id,
          nextStatus: 'CONSULTATION_SCHEDULED',
          reason:
            rescheduleReason.trim() ||
            'Consultation rescheduled and returned to scheduled stage.',
        });
      }

      await updateLeadFollowUp.mutateAsync({
        leadId: rescheduleTarget.lead_id,
        payload: {
          next_action:
            'Prepare for the rescheduled consultation and confirm attendance.',
          next_action_due_at: new Date(
            rescheduleScheduledAt
          ).toISOString(),
        },
      });

      toast.success('Consultation rescheduled');
      resetRescheduleDialog();
    } catch (error) {
      toast.error(
        isApiError(error)
          ? error.displayMessage
          : error instanceof Error
            ? error.message
            : 'Failed to reschedule consultation'
      );
    }
  };

  return (
    <>
      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium">
              Consultation Activity
            </p>
            <p className="text-xs text-muted-foreground">
              {scheduledCount} scheduled consultation
              {scheduledCount === 1 ? '' : 's'} currently need
              attention.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">
            Loading consultations...
          </div>
        ) : isError ? (
          <div className="p-4 text-sm text-destructive">
            Failed to load consultations.
          </div>
        ) : consultations.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {consultations.map((consultation) => (
              <div
                key={consultation.id}
                className="rounded-lg border bg-muted/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/15 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ConsultationStatusPill
                      status={consultation.status}
                    />
                    <span className="text-sm font-medium">
                      Consultation #{consultation.id}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatConsultationTime(
                      consultation.scheduled_at
                    )}
                  </span>
                </div>

                <div
                  className={`grid gap-3 px-4 py-4 md:grid-cols-2 ${showLeadContext ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}
                >
                  <div className="rounded-md border bg-background/60 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Schedule
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                      <CalendarClock className="size-4 text-muted-foreground" />
                      {formatConsultationTime(
                        consultation.scheduled_at
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {consultation.duration_minutes} minutes
                    </p>
                  </div>

                  <div className="rounded-md border bg-background/60 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Location
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                      <MapPin className="size-4 text-muted-foreground" />
                      {consultation.location || 'Not specified'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {consultation.meeting_link
                        ? 'Meeting link available'
                        : 'No meeting link provided'}
                    </p>
                  </div>

                  {showLeadContext ? (
                    <div className="rounded-md border bg-background/60 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Lead Context
                      </p>
                      {consultation.lead ? (
                        <>
                          <p className="mt-1 text-sm font-medium">
                            {consultation.lead.organization_name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {consultation.lead.contact_name} ·{' '}
                            {consultation.lead.contact_email}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Lead details unavailable.
                        </p>
                      )}
                    </div>
                  ) : null}

                  <div className="rounded-md border bg-background/60 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Follow-up
                    </p>
                    {consultation.lead?.next_action ? (
                      <>
                        <p className="mt-1 text-sm font-medium">
                          {consultation.lead.next_action}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Due{' '}
                          {consultation.lead.next_action_due_at
                            ? formatConsultationTime(
                                consultation.lead.next_action_due_at
                              )
                            : 'not set'}
                        </p>
                        {consultation.lead.next_action_due_at &&
                        new Date(
                          consultation.lead.next_action_due_at
                        ).getTime() < Date.now() ? (
                          <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-300">
                            Follow-up overdue
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        No follow-up planned yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {showLeadContext && consultation.lead ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate({
                            to: '/dashboard/sales/leads/$leadId',
                            params: {
                              leadId: String(consultation.lead!.id),
                            },
                          })
                        }
                      >
                        Open Lead
                      </Button>
                    ) : null}
                    {consultation.meeting_link ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          globalThis.open(
                            consultation.meeting_link!,
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                      >
                        <LinkIcon className="size-4" />
                        Join Link
                      </Button>
                    ) : null}
                  </div>

                  {(consultation.status === 'SCHEDULED' ||
                    consultation.status === 'NO_SHOW') &&
                  actionEnabled ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSubmittingReschedule}
                        onClick={() =>
                          openRescheduleDialog(consultation)
                        }
                      >
                        Reschedule
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          transitionConsultation.isPending ||
                          consultation.status !== 'SCHEDULED'
                        }
                        onClick={() =>
                          handleStatusUpdate(
                            consultation.id,
                            'COMPLETED'
                          )
                        }
                      >
                        Mark Completed
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          transitionConsultation.isPending ||
                          consultation.status !== 'SCHEDULED'
                        }
                        onClick={() =>
                          handleStatusUpdate(
                            consultation.id,
                            'NO_SHOW'
                          )
                        }
                      >
                        Mark No Show
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={
                          transitionConsultation.isPending ||
                          consultation.status !== 'SCHEDULED'
                        }
                        onClick={() => {
                          setCancelTarget(consultation);
                          setCancellationReason(
                            consultation.cancellation_reason || ''
                          );
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {consultation.status === 'CANCELLED' &&
                      consultation.cancellation_reason
                        ? `Reason: ${consultation.cancellation_reason}`
                        : consultation.status === 'NO_SHOW' &&
                            consultation.cancellation_reason
                          ? `Context: ${consultation.cancellation_reason}`
                          : 'No actions available'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmittingCancel) {
            setCancelTarget(null);
            setCancellationReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Consultation</DialogTitle>
            <DialogDescription>
              Confirm cancellation for consultation #
              {cancelTarget?.id}. You can optionally capture a reason
              for the lead or QA trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Consultation
              </p>
              <Input
                value={
                  cancelTarget
                    ? formatConsultationTime(
                        cancelTarget.scheduled_at
                      )
                    : ''
                }
                readOnly
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Cancellation reason (optional)
              </p>
              <Textarea
                value={cancellationReason}
                onChange={(event) =>
                  setCancellationReason(event.target.value)
                }
                placeholder="Add context for why this consultation is being cancelled."
                className="min-h-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelTarget(null);
                setCancellationReason('');
              }}
              disabled={isSubmittingCancel}
            >
              Keep Scheduled
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={isSubmittingCancel}
            >
              {isSubmittingCancel
                ? 'Cancelling...'
                : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rescheduleTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmittingReschedule) {
            resetRescheduleDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Consultation</DialogTitle>
            <DialogDescription>
              Create a new scheduled consultation for this lead. If
              the current consultation is still scheduled, it will be
              closed as cancelled by sales.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                New schedule
              </p>
              <Input
                type="datetime-local"
                value={rescheduleScheduledAt}
                onChange={(event) =>
                  setRescheduleScheduledAt(event.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Duration (minutes)
              </p>
              <Input
                type="number"
                min={15}
                step={15}
                value={rescheduleDuration}
                onChange={(event) =>
                  setRescheduleDuration(event.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Location
              </p>
              <Input
                value={rescheduleLocation}
                onChange={(event) =>
                  setRescheduleLocation(event.target.value)
                }
                placeholder="Google Meet, Zoom, Office..."
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Meeting link (optional)
              </p>
              <Input
                value={rescheduleMeetingLink}
                onChange={(event) =>
                  setRescheduleMeetingLink(event.target.value)
                }
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Reschedule note (optional)
            </p>
            <Textarea
              value={rescheduleReason}
              onChange={(event) =>
                setRescheduleReason(event.target.value)
              }
              placeholder="Explain why this consultation is being rescheduled."
              className="min-h-24"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={resetRescheduleDialog}
              disabled={isSubmittingReschedule}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={isSubmittingReschedule}
            >
              {isSubmittingReschedule
                ? 'Rescheduling...'
                : 'Save Reschedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
