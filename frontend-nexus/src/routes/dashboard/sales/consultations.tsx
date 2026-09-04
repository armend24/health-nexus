import { SalesConsultationsPanel } from '@/components/SalesConsultationsPanel';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { requireAuth } from '@/lib/guards/requireAuth';
import {
  type ConsultationStatus,
  useMyConsultations,
} from '@/services/sales-leads.service';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

export const Route = createFileRoute(
  '/dashboard/sales/consultations'
)({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_SALES_LEADS',
  }),
  component: SalesConsultationsPage,
});

const PAGE_SIZE = 10;

function SalesConsultationsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | ConsultationStatus
  >('ALL');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useMyConsultations({
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  });

  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / PAGE_SIZE)
  );

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Consultations</CardTitle>
          <CardDescription>
            All consultation activity linked to your sales pipeline
            across different leads.
          </CardDescription>
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate({ to: '/dashboard/sales/leads' })
              }
            >
              Leads
            </Button>
            <Button size="sm" variant="default">
              Consultations
            </Button>
            <Button
              size="sm"
              variant="outline"
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
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:max-w-xs">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Status
              </p>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as 'ALL' | ConsultationStatus)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="SCHEDULED">SCHEDULED</SelectItem>
                  <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                  <SelectItem value="NO_SHOW">NO_SHOW</SelectItem>
                  <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {isLoading
              ? 'Loading consultations...'
              : `Showing ${(data?.items ?? []).length} consultation${(data?.items?.length ?? 0) === 1 ? '' : 's'} (page ${page}/${totalPages})`}
          </div>

          <SalesConsultationsPanel
            consultations={data?.items ?? []}
            isLoading={isLoading}
            isError={isError}
            emptyMessage="No consultations match the current filter."
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1)
                )
              }
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
