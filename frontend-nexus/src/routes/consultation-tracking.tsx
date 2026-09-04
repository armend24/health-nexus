import { FormField } from '@/components/atoms/form-field';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { tenantsService } from '@/services/tenants.service';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

type TrackingSearch = {
  leadId?: number;
  email?: string;
  requestId?: string;
};

/**
 * Public tracking route for consultation requesters.
 * Uses lead_id + contact_email to fetch a roadmap without requiring login.
 */
export const Route = createFileRoute('/consultation-tracking')({
  validateSearch: (
    search: Record<string, unknown>
  ): TrackingSearch => {
    const rawLeadId = search.leadId;
    const rawEmail = search.email;
    const rawRequestId = search.requestId;
    const leadId =
      typeof rawLeadId === 'string' && /^\d+$/.test(rawLeadId)
        ? Number(rawLeadId)
        : undefined;
    const email =
      typeof rawEmail === 'string' && rawEmail.includes('@')
        ? rawEmail
        : undefined;
    const requestId =
      typeof rawRequestId === 'string' &&
      rawRequestId.trim().length > 0
        ? rawRequestId.trim()
        : leadId != null
          ? String(leadId)
          : undefined;
    return { leadId, email, requestId };
  },
  component: ConsultationTrackingPage,
});

function stepClass(state: 'DONE' | 'IN_PROGRESS' | 'NOT_STARTED') {
  if (state === 'DONE') {
    return 'border-green-500/40 bg-green-500/10 text-green-300';
  }
  if (state === 'IN_PROGRESS') {
    return 'border-orange-500/40 bg-orange-500/10 text-orange-300';
  }
  return 'border-border bg-muted/20 text-muted-foreground';
}

function ConsultationTrackingPage() {
  const search = Route.useSearch();
  const [leadIdInput, setLeadIdInput] = useState(
    search.leadId ? String(search.leadId) : ''
  );
  const [emailInput, setEmailInput] = useState(search.email ?? '');
  const [lookup, setLookup] = useState<TrackingSearch>({
    leadId: search.leadId,
    email: search.email,
  });

  const canLookup = useMemo(
    () => !!lookup.leadId && !!lookup.email,
    [lookup]
  );

  const trackingQuery = useQuery({
    queryKey: [
      'public-consultation-tracking',
      lookup.leadId,
      lookup.email,
    ],
    queryFn: () =>
      tenantsService.trackConsultationRequest({
        lead_id: lookup.leadId!,
        email: lookup.email!,
      }),
    enabled: canLookup,
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 p-4 lg:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Consultation Request Tracking</CardTitle>
          <CardDescription>
            Check your current stage in the sales workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {search.requestId ? (
            <div className="rounded-md border border-primary/30 bg-primary/10 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Your Request ID
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {search.requestId}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep this ID and your contact email to check status
                later.
              </p>
            </div>
          ) : null}
          <form
            className="grid gap-3 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              const parsedLeadId = Number(leadIdInput);
              if (!parsedLeadId || !emailInput) return;
              setLookup({
                leadId: parsedLeadId,
                email: emailInput.trim(),
              });
            }}
          >
            <div>
              <FormField
                id="lead-id"
                label="Request ID"
                value={leadIdInput}
                onChange={(e) => setLeadIdInput(e.target.value)}
                placeholder="e.g. 101"
              />
            </div>
            <div>
              <FormField
                id="contact-email"
                label="Contact Email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@organization.com"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Check Status
              </Button>
            </div>
          </form>

          {trackingQuery.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Unable to find this request. Confirm your request ID and
              email.
            </div>
          ) : null}

          {!trackingQuery.data ? null : (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg">
                  {trackingQuery.data.organization_name ||
                    'Your Organization'}
                </CardTitle>
                <CardDescription>
                  Current status: {trackingQuery.data.current_status}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
                  <p className="font-semibold text-foreground">
                    Request ID: {trackingQuery.data.lead_id}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Keep this ID and your contact email to check
                    status later.
                  </p>
                </div>
                {/* Roadmap states: green done, orange in-progress, gray not started. */}
                <ol className="grid gap-2 md:grid-cols-3">
                  {trackingQuery.data.roadmap.map((step) => (
                    <li
                      key={step.status}
                      className={`rounded-md border p-3 text-sm ${stepClass(step.state)}`}
                    >
                      <p className="font-semibold">{step.status}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide">
                        {step.state.replace('_', ' ')}
                      </p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
