import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SalesConsultationsPanel } from '@/components/SalesConsultationsPanel';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isApiError } from '@/lib/api-client';
import { requireAuth } from '@/lib/guards/requireAuth';
import {
  buildLeadRoadmap,
  type ConsultationStatus,
  getAllowedLeadTransitions,
  useLeadConsultations,
  type SalesLeadStatus,
  useClaimLead,
  useCompleteLatestLeadConsultation,
  useCreateLeadConsultation,
  useLeadStatusHistory,
  useReleaseLead,
  useSalesLead,
  useTransitionLead,
  useUpdateLeadFollowUp,
} from '@/services/sales-leads.service';
import { useAuthStore } from '@/stores/auth.store';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  User2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

/** Dedicated lead detail page for deep sales work (claim + status transitions). */
export const Route = createFileRoute(
  '/dashboard/sales/leads/$leadId'
)({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_SALES_LEADS',
  }),
  component: SalesLeadDetailsPage,
});

function StatusPill({ status }: { status: string }) {
  const statusClassByStatus: Record<string, string> = {
    NEW: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-400/35 dark:bg-slate-500/10 dark:text-slate-200',
    QUALIFIED:
      'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/12 dark:text-indigo-200',
    CONTACTED:
      'border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/12 dark:text-sky-200',
    CONSULTATION_SCHEDULED:
      'border-purple-300 bg-purple-100 text-purple-700 dark:border-purple-400/40 dark:bg-purple-500/12 dark:text-purple-200',
    CONSULTATION_COMPLETED:
      'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/12 dark:text-emerald-200',
    AWAITING_DECISION:
      'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/12 dark:text-amber-200',
    CONVERTED:
      'border-green-300 bg-green-100 text-green-700 dark:border-green-400/40 dark:bg-green-500/12 dark:text-green-200',
    REJECTED:
      'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/12 dark:text-rose-200',
    LOST: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-neutral-400/35 dark:bg-neutral-500/10 dark:text-neutral-300',
  };
  const statusClass =
    statusClassByStatus[status] ||
    'border-border bg-muted/20 text-muted-foreground';

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass}`}
    >
      {status}
    </span>
  );
}

function roadmapStepClass(
  state: 'DONE' | 'IN_PROGRESS' | 'NOT_STARTED'
) {
  if (state === 'DONE') {
    return 'border-green-500/40 bg-green-500/10 text-green-300';
  }
  if (state === 'IN_PROGRESS') {
    return 'border-orange-500/40 bg-orange-500/10 text-orange-300';
  }
  return 'border-border bg-muted/20 text-muted-foreground';
}

function isReasonRequiredForTransition(
  currentStatus: SalesLeadStatus,
  nextStatus: SalesLeadStatus
) {
  const transitionsWithoutReason = new Set<string>([
    'NEW->QUALIFIED',
    'QUALIFIED->CONTACTED',
    'CONTACTED->CONSULTATION_SCHEDULED',
    'CONSULTATION_SCHEDULED->CONSULTATION_COMPLETED',
    'AWAITING_DECISION->CONVERTED',
  ]);
  return !transitionsWithoutReason.has(
    `${currentStatus}->${nextStatus}`
  );
}

function getFollowUpState(nextActionDueAt: string | null) {
  if (!nextActionDueAt) {
    return {
      label: 'Not Planned',
      tone: 'border-border bg-muted/20 text-muted-foreground',
      helper: 'No deadline has been set yet.',
    };
  }

  const due = new Date(nextActionDueAt).getTime();
  const now = Date.now();
  const hoursUntilDue = (due - now) / (1000 * 60 * 60);

  if (hoursUntilDue < 0) {
    return {
      label: 'Overdue',
      tone: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
      helper:
        'This follow-up is past due and should be addressed now.',
    };
  }

  if (hoursUntilDue <= 24) {
    return {
      label: 'Due Soon',
      tone: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
      helper: 'This follow-up is due within the next 24 hours.',
    };
  }

  return {
    label: 'Planned',
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    helper: 'A next step and deadline are already scheduled.',
  };
}

function SalesLeadDetailsPage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const leadIdNum = Number(leadId);

  const { data: lead, isLoading } = useSalesLead(
    Number.isFinite(leadIdNum) ? leadIdNum : null
  );
  const {
    data: leadHistory,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
  } = useLeadStatusHistory(
    Number.isFinite(leadIdNum) ? leadIdNum : null
  );
  const {
    data: leadConsultations,
    isLoading: isConsultationsLoading,
    isError: isConsultationsError,
  } = useLeadConsultations(
    Number.isFinite(leadIdNum) ? leadIdNum : null
  );
  const claimLead = useClaimLead();
  const completeLatestLeadConsultation =
    useCompleteLatestLeadConsultation();
  const createLeadConsultation = useCreateLeadConsultation();
  const releaseLead = useReleaseLead();
  const transitionLead = useTransitionLead();
  const updateLeadFollowUp = useUpdateLeadFollowUp();
  const [nextStatus, setNextStatus] = useState<SalesLeadStatus | ''>(
    ''
  );
  const [transitionReason, setTransitionReason] = useState('');
  const [consultationScheduledAt, setConsultationScheduledAt] =
    useState('');
  const [consultationDuration, setConsultationDuration] =
    useState('45');
  const [consultationLocation, setConsultationLocation] =
    useState('Google Meet');
  const [consultationMeetingLink, setConsultationMeetingLink] =
    useState('');
  const [
    leadConsultationStatusFilter,
    setLeadConsultationStatusFilter,
  ] = useState<'ALL' | ConsultationStatus>('ALL');
  const [consultationsOpen, setConsultationsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [nextAction, setNextAction] = useState('');
  const [nextActionDueAt, setNextActionDueAt] = useState('');
  const consultationItems = leadConsultations?.items ?? [];

  useEffect(() => {
    setNextAction(lead?.next_action ?? '');
    setNextActionDueAt(
      lead?.next_action_due_at
        ? new Date(lead.next_action_due_at).toISOString().slice(0, 16)
        : ''
    );
  }, [lead?.next_action, lead?.next_action_due_at]);

  const consultationsForLead = useMemo(
    () =>
      consultationItems
        .filter((consultation) =>
          leadConsultationStatusFilter === 'ALL'
            ? true
            : consultation.status === leadConsultationStatusFilter
        )
        .map((consultation) => ({
          ...consultation,
          lead: lead ?? null,
        })),
    [consultationItems, lead, leadConsultationStatusFilter]
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading lead...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Lead not found</CardTitle>
            <CardDescription>
              This lead may have been removed or does not exist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() =>
                navigate({
                  to: '/dashboard/sales/leads',
                })
              }
            >
              Back to Leads
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isMine =
    lead.assigned_sales_user_id != null &&
    String(lead.assigned_sales_user_id) === user?.id;
  const hasOwner = !!lead.assigned_sales_user_id;
  const allowedTransitions = getAllowedLeadTransitions(lead.status);
  const roadmap = buildLeadRoadmap(lead.status);
  const historyItems = leadHistory?.items ?? [];
  const hasScheduledConsultation = consultationItems.some(
    (consultation) => consultation.status === 'SCHEDULED'
  );
  const hasCompletedConsultation = consultationItems.some(
    (consultation) => consultation.status === 'COMPLETED'
  );

  const ownershipInsight = !lead.assigned_sales_user_id
    ? {
        label: 'High Priority',
        variant: 'warning' as const,
        text: 'Unassigned lead ready to claim',
      }
    : isMine
      ? {
          label: 'Your Lead',
          variant: 'success' as const,
          text: 'Currently in your pipeline',
        }
      : {
          label: 'Locked',
          variant: 'neutral' as const,
          text: `Assigned to user #${lead.assigned_sales_user_id}`,
        };
  const followUpState = getFollowUpState(lead.next_action_due_at);
  const hasFollowUpPlan =
    !!lead.next_action || !!lead.next_action_due_at;

  const formatHistoryActor = (changedByUserId: number) => {
    const currentUserId = Number(user?.id);
    if (
      Number.isFinite(currentUserId) &&
      changedByUserId === currentUserId
    ) {
      const fullName =
        typeof user?.fullName === 'string'
          ? user.fullName.trim()
          : '';
      if (fullName.length > 0) return fullName;
      if (typeof user?.email === 'string' && user.email.length > 0) {
        return user.email;
      }
      return 'You';
    }
    return 'Sales Agent';
  };

  const handleClaim = async () => {
    try {
      await claimLead.mutateAsync(lead.id);
      toast.success('Lead claimed');
    } catch {
      toast.error('Failed to claim lead');
    }
  };

  const handleRelease = async () => {
    try {
      await releaseLead.mutateAsync(lead.id);
      toast.success('Lead released');
    } catch {
      toast.error('Failed to release lead');
    }
  };

  const handleTransition = async () => {
    if (!nextStatus) return;
    const reasonRequired = isReasonRequiredForTransition(
      lead.status,
      nextStatus
    );
    if (reasonRequired && !transitionReason.trim()) {
      toast.error('Reason is required for this transition.');
      return;
    }

    if (nextStatus === 'CONSULTATION_SCHEDULED') {
      if (!consultationScheduledAt.trim()) {
        toast.error(
          'Consultation date and time are required before scheduling status.'
        );
        return;
      }
      if (!consultationLocation.trim()) {
        toast.error(
          'Consultation location is required before scheduling status.'
        );
        return;
      }
    }

    try {
      if (nextStatus === 'CONSULTATION_SCHEDULED') {
        await createLeadConsultation.mutateAsync({
          leadId: lead.id,
          payload: {
            scheduled_at: new Date(
              consultationScheduledAt
            ).toISOString(),
            duration_minutes: Math.max(
              15,
              Number(consultationDuration) || 45
            ),
            location: consultationLocation.trim(),
            meeting_link: consultationMeetingLink.trim() || undefined,
          },
        });
      }
      if (nextStatus === 'CONSULTATION_COMPLETED') {
        await completeLatestLeadConsultation.mutateAsync(lead.id);
      }
      await transitionLead.mutateAsync({
        leadId: lead.id,
        nextStatus,
        reason: transitionReason.trim() || undefined,
      });
      setNextStatus('');
      setTransitionReason('');
      toast.success(`Status updated to ${nextStatus}`);
    } catch (err) {
      if (isApiError(err)) {
        toast.error(err.displayMessage);
        return;
      }
      if (err instanceof Error && err.message) {
        toast.error(err.message);
        return;
      }
      toast.error('Failed to update status');
    }
  };

  const handleSaveFollowUp = async () => {
    try {
      await updateLeadFollowUp.mutateAsync({
        leadId: lead.id,
        payload: {
          next_action: nextAction,
          next_action_due_at: nextActionDueAt
            ? new Date(nextActionDueAt).toISOString()
            : null,
        },
      });
      toast.success('Follow-up updated');
    } catch (err) {
      if (isApiError(err)) {
        toast.error(err.displayMessage);
        return;
      }
      toast.error('Failed to update follow-up');
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Lead Details</h1>
          <p className="text-sm text-muted-foreground">
            {lead.organization_name}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            navigate({
              to: '/dashboard/sales/leads',
            })
          }
        >
          Back to Leads
        </Button>
      </div>

      <Card className="border-primary/20 py-0 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/8 via-transparent to-transparent pt-5 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            Lead Insights
          </CardTitle>
          <CardDescription>
            Dedicated detail view for ownership and stage progression.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={lead.status} />
            <Badge variant={ownershipInsight.variant}>
              {ownershipInsight.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {ownershipInsight.text}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Organization
              </p>
              <p className="mt-1 text-base font-semibold">
                {lead.organization_name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Licence: {lead.licence_number}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Contact
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <User2 className="size-4 text-muted-foreground" />
                {lead.contact_name}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <Mail className="size-4 text-muted-foreground" />
                {lead.contact_email}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <Phone className="size-4 text-muted-foreground" />
                {lead.contact_phone || 'Not provided'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="mt-1 text-sm font-medium">
                {lead.assigned_sales_user_id != null
                  ? isMine
                    ? 'You'
                    : `User #${lead.assigned_sales_user_id}`
                  : 'Unassigned'}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="mt-1 text-sm font-medium">
                {lead.source || 'N/A'}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">
                Created At
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="size-4 text-muted-foreground" />
                {new Date(lead.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Initial Message
            </p>
            <p className="mt-2 text-sm text-foreground">
              {lead.initial_message ||
                'No message was provided by this lead.'}
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ownership
            </p>
            <div className="mt-3 flex gap-2">
              {isMine ? (
                <Button
                  variant="outline"
                  onClick={handleRelease}
                  disabled={releaseLead.isPending}
                >
                  {releaseLead.isPending
                    ? 'Releasing...'
                    : 'Release Lead'}
                </Button>
              ) : (
                <Button
                  onClick={handleClaim}
                  disabled={hasOwner || claimLead.isPending}
                >
                  {claimLead.isPending ? 'Claiming...' : 'Claim Lead'}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Next Action
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep the follow-up note and due date current so the
              consultation handoff stays visible in the pipeline.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-[1.7fr_1fr_1fr]">
              <div className="rounded-md border bg-muted/15 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Current Plan
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {lead.next_action || 'No follow-up planned yet.'}
                </p>
              </div>
              <div className="rounded-md border bg-muted/15 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Due At
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {lead.next_action_due_at
                    ? new Date(
                        lead.next_action_due_at
                      ).toLocaleString()
                    : 'Not scheduled'}
                </p>
              </div>
              <div className="rounded-md border bg-muted/15 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-medium ${followUpState.tone}`}
                >
                  {followUpState.label}
                </span>
                <p className="mt-2 text-xs text-muted-foreground">
                  {followUpState.helper}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Next action
                </p>
                <Input
                  value={nextAction}
                  onChange={(event) =>
                    setNextAction(event.target.value)
                  }
                  placeholder="Follow up with availability options"
                  disabled={!isMine || updateLeadFollowUp.isPending}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Due at
                </p>
                <Input
                  type="datetime-local"
                  value={nextActionDueAt}
                  onChange={(event) =>
                    setNextActionDueAt(event.target.value)
                  }
                  disabled={!isMine || updateLeadFollowUp.isPending}
                />
              </div>
            </div>
            {!hasFollowUpPlan ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Add the next planned step so the lead does not stall
                in the pipeline.
              </p>
            ) : null}
            {isMine ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveFollowUp}
                  disabled={updateLeadFollowUp.isPending}
                >
                  {updateLeadFollowUp.isPending
                    ? 'Saving...'
                    : 'Save Follow-up'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setNextAction('');
                    setNextActionDueAt('');
                  }}
                  disabled={updateLeadFollowUp.isPending}
                >
                  Clear Draft
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Claim this lead to manage follow-up notes.
              </p>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status Transition
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Allowed next steps from{' '}
              <span className="font-medium text-foreground">
                {lead.status}
              </span>
              :{' '}
              {allowedTransitions.length > 0
                ? allowedTransitions.join(', ')
                : 'Terminal status'}
            </p>
            {lead.status === 'CONSULTATION_SCHEDULED' &&
            !hasScheduledConsultation &&
            !hasCompletedConsultation ? (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                There is no active scheduled consultation on this
                lead. Create or reschedule a consultation before
                moving to consultation completed.
              </p>
            ) : null}
            {lead.status === 'CONSULTATION_SCHEDULED' &&
            hasCompletedConsultation ? (
              <p className="mt-2 text-xs text-muted-foreground">
                A completed consultation record already exists. You
                can advance the lead status without creating a new
                one.
              </p>
            ) : null}

            {!isMine ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Claim this lead to change its status.
              </p>
            ) : allowedTransitions.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                This lead is in a terminal state.
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={nextStatus}
                    onValueChange={(value) =>
                      setNextStatus(value as SalesLeadStatus)
                    }
                  >
                    <SelectTrigger className="sm:w-64">
                      <SelectValue placeholder="Select next status" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="top"
                      align="start"
                    >
                      {allowedTransitions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {nextStatus === 'CONSULTATION_SCHEDULED' ? null : (
                    <Button
                      onClick={handleTransition}
                      disabled={
                        !nextStatus ||
                        transitionLead.isPending ||
                        createLeadConsultation.isPending ||
                        completeLatestLeadConsultation.isPending
                      }
                    >
                      {transitionLead.isPending ||
                      createLeadConsultation.isPending ||
                      completeLatestLeadConsultation.isPending
                        ? 'Updating...'
                        : 'Update Status'}
                    </Button>
                  )}
                </div>

                {nextStatus === 'CONSULTATION_SCHEDULED' ? (
                  <div className="mt-3 rounded-md border bg-muted/20 p-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      A scheduled consultation record is required
                      before this transition.
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Scheduled at
                        </p>
                        <Input
                          type="datetime-local"
                          value={consultationScheduledAt}
                          onChange={(e) =>
                            setConsultationScheduledAt(e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Duration (minutes)
                        </p>
                        <Input
                          type="number"
                          min={15}
                          step={15}
                          value={consultationDuration}
                          onChange={(e) =>
                            setConsultationDuration(e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Location
                        </p>
                        <Input
                          value={consultationLocation}
                          onChange={(e) =>
                            setConsultationLocation(e.target.value)
                          }
                          placeholder="Google Meet, Zoom, Office..."
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Meeting link (optional)
                        </p>
                        <Input
                          value={consultationMeetingLink}
                          onChange={(e) =>
                            setConsultationMeetingLink(e.target.value)
                          }
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button
                        onClick={handleTransition}
                        disabled={
                          transitionLead.isPending ||
                          createLeadConsultation.isPending ||
                          completeLatestLeadConsultation.isPending
                        }
                      >
                        {transitionLead.isPending ||
                        createLeadConsultation.isPending ||
                        completeLatestLeadConsultation.isPending
                          ? 'Scheduling...'
                          : 'Create Consultation and Update Status'}
                      </Button>
                    </div>
                  </div>
                ) : null}
                {nextStatus &&
                isReasonRequiredForTransition(
                  lead.status,
                  nextStatus
                ) ? (
                  <div className="mt-3 rounded-md border bg-muted/20 p-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      Reason is required for this transition.
                    </p>
                    <Input
                      value={transitionReason}
                      onChange={(e) =>
                        setTransitionReason(e.target.value)
                      }
                      placeholder="Enter reason for status change..."
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sales Roadmap
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Green = accomplished, orange = in progress, gray = not
              started.
            </p>
            <ol className="mt-3 grid gap-2 md:grid-cols-3">
              {roadmap.map((step) => (
                <li
                  key={step.status}
                  className={`rounded-md border p-3 text-sm ${roadmapStepClass(step.state)}`}
                >
                  <p className="font-semibold">{step.status}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide">
                    {step.state.replace('_', ' ')}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Consultations
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Consultation records linked to this lead. Scheduled
                  consultations can be completed, marked no-show, or
                  cancelled here.
                </p>
              </div>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <div className="w-full sm:w-52">
                  <Select
                    value={leadConsultationStatusFilter}
                    onValueChange={(value) =>
                      setLeadConsultationStatusFilter(
                        value as 'ALL' | ConsultationStatus
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="SCHEDULED">
                        SCHEDULED
                      </SelectItem>
                      <SelectItem value="COMPLETED">
                        COMPLETED
                      </SelectItem>
                      <SelectItem value="NO_SHOW">NO_SHOW</SelectItem>
                      <SelectItem value="CANCELLED">
                        CANCELLED
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConsultationsOpen((current) => !current)
                  }
                >
                  {consultationsOpen ? (
                    <>
                      <ChevronUp className="size-4" />
                      Hide
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-4" />
                      Show
                    </>
                  )}
                </Button>
              </div>
            </div>
            {consultationsOpen ? (
              <div className="mt-4">
                <SalesConsultationsPanel
                  consultations={consultationsForLead}
                  isLoading={isConsultationsLoading}
                  isError={isConsultationsError}
                  emptyMessage="No consultations found for this lead."
                  showLeadContext={false}
                  actionEnabled={isMine}
                />
              </div>
            ) : (
              <div className="mt-4 rounded-md border bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
                Consultations section collapsed.
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lead Status History
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Audit trail of actual status transitions for this
                  lead.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryOpen((current) => !current)}
              >
                {historyOpen ? (
                  <>
                    <ChevronUp className="size-4" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-4" />
                    Show
                  </>
                )}
              </Button>
            </div>
            {historyOpen ? (
              isHistoryLoading ? (
                <div className="mt-3 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Loading status history...
                </div>
              ) : isHistoryError ? (
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  Lead history is not available from backend yet.
                </div>
              ) : historyItems.length === 0 ? (
                <p className="mt-3 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No status transitions recorded yet.
                </p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {historyItems.map((item, index) => (
                    <li
                      key={item.id}
                      className="rounded-lg border bg-muted/10 overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                            {index + 1}
                          </span>
                          <StatusPill
                            status={item.old_status ?? 'UNKNOWN'}
                          />
                          <span className="text-xs text-muted-foreground">
                            →
                          </span>
                          <StatusPill status={item.new_status} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.changed_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid gap-3 px-3 py-3 md:grid-cols-2">
                        <div className="rounded-md border bg-background/60 p-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Changed By
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {formatHistoryActor(
                              item.changed_by_user_id
                            )}
                          </p>
                        </div>
                        <div className="rounded-md border bg-background/60 p-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Details
                          </p>
                          <p className="mt-1 text-sm">
                            {item.reason || 'No details provided.'}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )
            ) : (
              <div className="mt-4 rounded-md border bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
                Lead status history section collapsed.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
