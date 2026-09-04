import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { tenantsService } from '@/services/tenants.service';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

interface ActiveTenantContextProps {
  tenantId: number | null;
  title: string;
  description: string;
}

export function ActiveTenantContext({
  tenantId,
  title,
  description,
}: ActiveTenantContextProps) {
  const tenantsQuery = useQuery({
    queryKey: ['public-tenants'],
    queryFn: () => tenantsService.listPublicTenants(),
    staleTime: 60_000,
  });

  const tenant =
    tenantId == null
      ? null
      : tenantsQuery.data?.find((item) => item.id === tenantId) ?? null;

  return (
    <Card className="border-primary/15 bg-primary/5">
      <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Tenant Context
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {title}:{' '}
              {tenantId == null
                ? 'No tenant selected'
                : tenant?.name ??
                  (tenantsQuery.isLoading
                    ? 'Loading tenant...'
                    : `Tenant #${tenantId}`)}
            </p>
            {tenantId != null ? (
              <Badge variant="secondary">Tenant-scoped</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <Link to="/tenants">
          <Button variant="outline">Change tenant</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
