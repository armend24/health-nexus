import { Button } from '@/components/ui/button';
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
import {
  useClaimLead,
  useReleaseLead,
  useSalesLeads,
  type SalesLeadStatus,
} from '@/services/sales-leads.service';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

/**
 * Sales lead inbox list view for:
 * - /dashboard/sales/leads (all leads)
 * - /dashboard/sales/my-leads (owned leads)
 *
 * Deep lead work happens on a dedicated detail page:
 * /dashboard/sales/leads/$leadId
 */
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

export default function SalesLeadsInbox({
  scope = 'all',
}: {
  scope?: 'all' | 'mine';
}) {
  const PAGE_SIZE = 5;
  const claimLead = useClaimLead();
  const releaseLead = useReleaseLead();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('NEWEST');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSalesLeads({
    scope,
    page,
    pageSize: PAGE_SIZE,
    status:
      statusFilter !== 'ALL'
        ? (statusFilter as SalesLeadStatus)
        : undefined,
    source: sourceFilter !== 'ALL' ? sourceFilter : undefined,
    search: search.trim() || undefined,
    sort:
      sortBy === 'NEWEST'
        ? '-created_at'
        : sortBy === 'OLDEST'
          ? 'created_at'
          : '-created_at',
  });
  const leads = data?.items ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / PAGE_SIZE)
  );
  const statusOptions = useMemo(
    () => ['ALL', ...Array.from(new Set(leads.map((l) => l.status)))],
    [leads]
  );
  const sourceOptions = ['ALL', 'WEBSITE', 'REFERRAL', 'MARKETING'];

  useEffect(() => {
    setPage(1);
  }, [scope, search, statusFilter, sourceFilter, sortBy]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleClaim = async (leadId: number) => {
    try {
      await claimLead.mutateAsync(leadId);
      toast.success('Lead claimed');
    } catch {
      toast.error('Failed to claim lead');
    }
  };

  const handleRelease = async (leadId: number) => {
    try {
      await releaseLead.mutateAsync(leadId);
      toast.success('Lead released');
    } catch {
      toast.error('Failed to release lead');
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {scope === 'mine' ? 'My Leads' : 'Sales Leads Inbox'}
          </CardTitle>
          <CardDescription>
            {scope === 'mine'
              ? 'Leads currently assigned to you.'
              : 'Unassigned sales leads from the backend pipeline queue.'}
          </CardDescription>
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant={scope === 'all' ? 'default' : 'outline'}
              onClick={() =>
                navigate({
                  to: '/dashboard/sales/leads',
                })
              }
            >
              Leads
            </Button>
            <Button
              size="sm"
              variant={scope === 'mine' ? 'default' : 'outline'}
              onClick={() =>
                navigate({
                  to: '/dashboard/sales/my-leads',
                })
              }
            >
              My Leads
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Search
              </p>
              <Input
                placeholder="Org, contact, email, licence..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Status
              </p>
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Source
              </p>
              <Select
                value={sourceFilter}
                onValueChange={setSourceFilter}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Sort
              </p>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEWEST">Newest</SelectItem>
                  <SelectItem value="OLDEST">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mb-3 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Filter Guide:
            </span>{' '}
            Use{' '}
            <span className="font-medium text-foreground">Leads</span>{' '}
            for the unassigned queue and{' '}
            <span className="font-medium text-foreground">
              My Leads
            </span>{' '}
            for your claimed leads. Filters apply to the selected tab.
          </div>

          <div className="mb-3 text-xs text-muted-foreground">
            {isLoading
              ? 'Loading leads...'
              : `Showing ${leads.length} lead${leads.length === 1 ? '' : 's'} (page ${page}/${totalPages})`}
          </div>

          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {scope === 'mine'
                ? 'No leads assigned to you yet. Claim one from Leads.'
                : 'No unassigned leads available right now.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              {/* Row click navigates to dedicated detail route for deep lead workflow. */}
              <table className="w-full text-sm">
                <thead className="bg-muted/20">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      Organization
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Contact
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Owner
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Created
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    return (
                      <tr
                        key={lead.id}
                        className="cursor-pointer border-t transition-colors hover:bg-muted/30"
                        onClick={() =>
                          navigate({
                            to: '/dashboard/sales/leads/$leadId',
                            params: {
                              leadId: String(lead.id),
                            },
                          })
                        }
                      >
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium">
                            {lead.organization_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {lead.licence_number}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div>{lead.contact_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {lead.contact_email}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <StatusPill status={lead.status} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          {scope === 'mine' ? 'You' : 'Unassigned'}
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {new Date(lead.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          {scope === 'mine' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRelease(lead.id);
                              }}
                              disabled={releaseLead.isPending}
                            >
                              Release
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClaim(lead.id);
                              }}
                              disabled={claimLead.isPending}
                            >
                              Claim
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(data?.total ?? 0) > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
