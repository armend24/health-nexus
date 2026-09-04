import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireAuth } from '@/lib/guards/requireAuth';
import { auditLogsService } from '@/services/audit-logs.service';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/dashboard/audit-logs/')({
  beforeLoad: requireAuth({
    routeKey: 'DASHBOARD_AUDIT_LOGS',
  }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => auditLogsService.list(page, pageSize),
  });

  const logs = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total
    ? Math.ceil(data.total / pageSize)
    : 1;

  const getEventBadge = (event: string) => {
    switch (event) {
      case 'STATUS_CHANGE':
        return 'warning';
      case 'CREATION':
        return 'success';
      case 'DELETION':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground mt-2">
          Track all tenant lifecycle changes across the platform
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Activity History</CardTitle>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="text-center text-destructive py-10">
              Failed to load audit logs
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Changes</TableHead>
                    <TableHead>Performed By</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-10 text-muted-foreground"
                      >
                        No audit logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{log.id}</TableCell>

                        <TableCell>
                          <Badge
                            variant={getEventBadge(log.event_type)}
                          >
                            {log.event_type}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <div className="font-medium capitalize">
                            {log.entity_name}
                          </div>
                          {log.entity_id && (
                            <span className="text-xs text-muted-foreground">
                              #{log.entity_id}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-sm">
                          <div className="space-y-2">
                            {log.old_value && (
                              <div className="rounded-lg border p-2 bg-muted/40">
                                <div className="text-xs font-semibold text-muted-foreground mb-1">
                                  Old Status
                                </div>
                                <div className="text-sm font-mono">
                                  {typeof log.old_value === 'object'
                                    ? JSON.stringify(
                                        log.old_value,
                                        null,
                                        2
                                      )
                                    : log.old_value}
                                </div>
                              </div>
                            )}

                            {log.new_value && (
                              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                                <div className="text-xs font-semibold text-primary mb-1">
                                  New Status
                                </div>
                                <div className="text-sm font-semibold text-foreground">
                                  {typeof log.new_value === 'object'
                                    ? JSON.stringify(
                                        log.new_value,
                                        null,
                                        2
                                      )
                                    : log.new_value}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-sm">
                          {log.performed_by_role && (
                            <Badge variant="outline">
                              {log.performed_by_role}
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-sm">
                          {log.performed_by_role && (
                            <Badge variant="outline">
                              {log.performed_by_role}
                            </Badge>
                          )}
                          {log.performed_by_user_id && (
                            <div className="text-xs text-muted-foreground">
                              User #{log.performed_by_user_id}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="max-w-50 text-sm text-muted-foreground">
                          {log.reason || '-'}
                        </TableCell>

                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(log.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t pt-4 mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1}-
                  {Math.min(page * pageSize, total)} of {total}
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>

                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={page === totalPages || isLoading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
