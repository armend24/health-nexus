import { FormSelect } from '@/components/atoms/form-select';
import { FeatureUnavailableCard } from '@/components/molecules/feature-unavailable-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ErrorStateCard } from '@/components/ui/error-state-card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Switch } from '@/components/ui/switch';
import { isApiError } from '@/lib/api-client';
import { humanizeSnakeCase } from '@/lib/formatters';
import {
  featureFlagsService,
  type FeatureFlagRecord,
} from '@/services/feature-flags.service';
import {
  IconChevronDown,
  IconLockAccess,
  IconRefresh,
  IconSettingsCheck,
} from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const FEATURE_FLAGS_QUERY_KEY = ['permissions', 'feature-flags'];

export function PermissionsFeatureFlagsPanel() {
  const queryClient = useQueryClient();
  const [openPlans, setOpenPlans] = useState<Record<string, boolean>>(
    {}
  );

  const [selectedTenantId, setSelectedTenantId] =
    useState<string>('all');

  const selectedTenantNumber =
    selectedTenantId === 'all' ? undefined : Number(selectedTenantId);

  const { data: tenantOptions = [], isLoading: isLoadingTenants } =
    useQuery({
      queryKey: ['permissions', 'feature-flags', 'tenants'],
      queryFn: () => featureFlagsService.listTenants(),
    });

  const {
    data: flags = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      ...FEATURE_FLAGS_QUERY_KEY,
      selectedTenantNumber ?? 'all',
    ],
    queryFn: () => featureFlagsService.list(selectedTenantNumber),
  });

  const selectedTenant = useMemo(
    () =>
      tenantOptions.find(
        (tenant) => tenant.id === selectedTenantNumber
      ),
    [tenantOptions, selectedTenantNumber]
  );

  const groupedByPlan = useMemo(
    () =>
      featureFlagsService.groupRecords({
        flags,
        tenantOptions,
        selectedTenantId: selectedTenantNumber,
      }),
    [flags, tenantOptions, selectedTenantNumber]
  );

  const selectedTenantHasNoPermissions =
    selectedTenantNumber !== undefined &&
    groupedByPlan.length === 1 &&
    groupedByPlan[0]?.rows.length === 0;

  const togglePlan = (groupKey: string) => {
    setOpenPlans((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const updateMutation = useMutation({
    mutationFn: ({
      row,
      nextEnabled,
    }: {
      row: FeatureFlagRecord;
      nextEnabled: boolean;
    }) => {
      if (row.tenant_id !== null) {
        return featureFlagsService.upsertTenantOverride({
          tenant_id: row.tenant_id,
          feature_key: row.feature_key,
          enabled: nextEnabled,
        });
      }

      if (selectedTenantNumber !== undefined) {
        return featureFlagsService.upsertTenantOverride({
          tenant_id: selectedTenantNumber,
          feature_key: row.feature_key,
          enabled: nextEnabled,
        });
      }

      if (!row.plan_tier) {
        throw new Error(
          'Cannot update plan default without plan tier'
        );
      }

      return featureFlagsService.upsertPlanDefault({
        plan_tier: row.plan_tier,
        feature_key: row.feature_key,
        enabled: nextEnabled,
      });
    },
    onMutate: async ({ row, nextEnabled }) => {
      await queryClient.cancelQueries({
        queryKey: [
          ...FEATURE_FLAGS_QUERY_KEY,
          selectedTenantNumber ?? 'all',
        ],
      });
      const previousFlags =
        queryClient.getQueryData<FeatureFlagRecord[]>([
          ...FEATURE_FLAGS_QUERY_KEY,
          selectedTenantNumber ?? 'all',
        ]) ?? [];

      queryClient.setQueryData<FeatureFlagRecord[]>(
        [...FEATURE_FLAGS_QUERY_KEY, selectedTenantNumber ?? 'all'],
        (current = []) => {
          if (
            selectedTenantNumber !== undefined &&
            row.tenant_id === null
          ) {
            return [
              ...current,
              {
                ...row,
                id: row.id * -1,
                tenant_id: selectedTenantNumber,
                plan_tier: null,
                enabled: nextEnabled,
              },
            ];
          }

          return current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  enabled: nextEnabled,
                }
              : item
          );
        }
      );

      return { previousFlags };
    },
    onSuccess: (_data, variables) => {
      const featureName = humanizeSnakeCase(
        variables.row.feature_key
      );
      const scope =
        groupedByPlan
          .flatMap((group) => group.rows)
          .find((row) => row.id === variables.row.id)?.scopeLabel ??
        `Plan ${variables.row.plan_tier ?? 'unknown'}`;
      toast.success(
        `${featureName} (${scope}): Turned ${
          variables.nextEnabled ? 'On' : 'Off'
        }`
      );
    },
    onError: (mutationError, _vars, context) => {
      if (context?.previousFlags) {
        queryClient.setQueryData(
          [...FEATURE_FLAGS_QUERY_KEY, selectedTenantNumber ?? 'all'],
          context.previousFlags
        );
      }
      toast.error('Failed to update feature flag', {
        description: isApiError(mutationError)
          ? mutationError.displayMessage
          : 'Unknown error while saving changes',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: FEATURE_FLAGS_QUERY_KEY,
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => featureFlagsService.resetToSeed(),
    onSuccess: (seedFlags) => {
      queryClient.setQueryData(FEATURE_FLAGS_QUERY_KEY, seedFlags);
      toast.success('Reset to initial values complete');
      void queryClient.invalidateQueries({
        queryKey: FEATURE_FLAGS_QUERY_KEY,
      });
    },
    onError: (err) => {
      toast.error('Failed to reset to initial values', {
        description: isApiError(err)
          ? err.displayMessage
          : 'Unknown error while resetting',
      });
    },
  });

  if (isLoading) {
    return <LoadingSpinner label="Loading feature flags..." />;
  }

  if (isError) {
    return (
      <ErrorStateCard
        title="Feature Flags"
        message={
          isApiError(error)
            ? error.displayMessage
            : 'Failed to load feature flags'
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <IconSettingsCheck className="size-5" />
            Feature Flags
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={
              resetMutation.isPending ||
              isLoading ||
              updateMutation.isPending
            }
          >
            <IconRefresh className="size-4" />
            {resetMutation.isPending ? 'Resetting...' : 'Reset'}
          </Button>
        </div>
        <CardDescription>
          Filter by tenant to create and manage overrides by tenant
          id.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Tenant filter</p>
            <p className="text-xs text-muted-foreground">
              {selectedTenant
                ? `Showing inherited flags and overrides for ${selectedTenant.name}.`
                : 'Showing all plan defaults and existing tenant overrides.'}
            </p>
          </div>
          <div className="w-full sm:w-80">
            <FormSelect
              id="feature-flag-tenant-filter"
              label="Tenant"
              value={selectedTenantId}
              onValueChange={setSelectedTenantId}
              options={[
                { value: 'all', label: 'All tenants' },
                ...tenantOptions.map((tenant) => ({
                  value: String(tenant.id),
                  label: tenant.name,
                })),
              ]}
              placeholder="Filter by tenant"
              disabled={isLoadingTenants}
            />
          </div>
        </div>
        {selectedTenantHasNoPermissions ? (
          <FeatureUnavailableCard
            title="No plan assigned"
            description={
              selectedTenant
                ? `${selectedTenant.name} does not have an active plan assigned yet, so there are no inherited permissions to manage.`
                : 'This tenant does not have an active plan assigned yet, so there are no inherited permissions to manage.'
            }
            featureLabel="Tenant permissions unavailable"
            className="border-border/70 bg-muted/10"
          />
        ) : groupedByPlan.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No feature flags found.
          </p>
        ) : (
          groupedByPlan.map(({ groupKey, groupLabel, rows }) => {
            const isOpen = openPlans[groupKey] ?? true;
            return (
              <div
                key={groupKey}
                className="overflow-hidden rounded-lg border"
              >
                <Button
                  variant="ghost"
                  onClick={() => togglePlan(groupKey)}
                  className="flex h-auto w-full items-center justify-between rounded-none px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <IconLockAccess className="size-4 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium">
                        {humanizeSnakeCase(groupLabel)}
                      </p>
                      {selectedTenantNumber !== undefined ? (
                        <p className="text-xs text-muted-foreground">
                          Toggle any inherited flag to create a tenant
                          override.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="secondary">
                      {rows.length} permissions
                    </Badge>
                    <IconChevronDown
                      className={`size-4 transition-transform ${
                        isOpen ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </div>
                </Button>

                {isOpen ? (
                  <div className="space-y-2 border-t bg-muted/20 p-3">
                    {rows.map((row) => {
                      const isPendingForRow =
                        updateMutation.isPending &&
                        updateMutation.variables?.row.id === row.id;
                      const toggleRow = (nextEnabled: boolean) =>
                        updateMutation.mutate({
                          row,
                          nextEnabled,
                        });

                      return (
                        <button
                          type="button"
                          key={row.id}
                          disabled={isPendingForRow}
                          onClick={() => toggleRow(!row.enabled)}
                          className="flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant={row.badgeVariant}>
                              {humanizeSnakeCase(row.feature_key)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {row.sourceLabel}
                            </span>
                          </div>
                          <Switch
                            checked={row.enabled}
                            disabled={isPendingForRow}
                            onClick={(event) =>
                              event.stopPropagation()
                            }
                            onCheckedChange={toggleRow}
                            aria-label={`Toggle ${row.feature_key}`}
                          />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
        {isLoadingTenants ? (
          <p className="text-xs text-muted-foreground">
            Loading tenants...
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
