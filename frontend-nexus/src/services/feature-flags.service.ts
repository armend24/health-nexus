import { apiFetch } from '@/lib/api-client';

const BASE = '/api/superadmin/feature-flags';
const FEATURE_BADGE_VARIANTS = [
  'sky',
  'emerald',
  'amber',
  'rose',
  'violet',
  'cyan',
] as const;

export interface FeatureFlagRecord {
  id: number;
  tenant_id: number | null;
  feature_key: string;
  enabled: boolean;
  plan_tier: string | null;
}

export interface FeatureFlagTenantOption {
  id: number;
  name: string;
}

export interface FeatureFlagGroupRow extends FeatureFlagRecord {
  badgeVariant: (typeof FEATURE_BADGE_VARIANTS)[number];
  scopeLabel: string;
  sourceLabel: string;
}

export interface FeatureFlagGroup {
  groupKey: string;
  groupLabel: string;
  rows: FeatureFlagGroupRow[];
}

export interface PlanDefaultPayload {
  plan_tier: string;
  feature_key: string;
  enabled: boolean;
}

export interface TenantOverridePayload {
  tenant_id: number;
  feature_key: string;
  enabled: boolean;
}

function getTenantLabel(
  tenantId: number,
  tenantNameById: Map<number, string>
) {
  return tenantNameById.get(tenantId) ?? `Tenant #${tenantId}`;
}

function getFeatureBadgeVariant(featureKey: string) {
  const hash = [...featureKey].reduce(
    (total, char) => total + char.charCodeAt(0),
    0
  );
  return FEATURE_BADGE_VARIANTS[hash % FEATURE_BADGE_VARIANTS.length];
}

function getScopeLabel(
  row: FeatureFlagRecord,
  tenantNameById: Map<number, string>
) {
  return row.tenant_id !== null
    ? getTenantLabel(row.tenant_id, tenantNameById)
    : `Plan ${row.plan_tier ?? 'unknown'}`;
}

function toGroupRow(
  row: FeatureFlagRecord,
  tenantNameById: Map<number, string>,
  selectedTenant?: FeatureFlagTenantOption
): FeatureFlagGroupRow {
  const scopeLabel = getScopeLabel(row, tenantNameById);
  const sourceLabel =
    selectedTenant && row.tenant_id === selectedTenant.id
      ? 'Tenant override'
      : selectedTenant && row.tenant_id === null
        ? `Inherited from ${row.plan_tier ?? 'plan'}`
        : scopeLabel;

  return {
    ...row,
    badgeVariant: getFeatureBadgeVariant(row.feature_key),
    scopeLabel,
    sourceLabel,
  };
}

export const featureFlagsService = {
  list: (tenantId?: number) =>
    apiFetch<FeatureFlagRecord[]>(
      tenantId ? `${BASE}?tenant_id=${tenantId}` : BASE,
      {
        method: 'GET',
      }
    ),

  listTenants: () =>
    apiFetch<FeatureFlagTenantOption[]>(`${BASE}/tenants`, {
      method: 'GET',
    }),

  upsertPlanDefault: (payload: PlanDefaultPayload) =>
    apiFetch<FeatureFlagRecord>(`${BASE}/defaults`, {
      method: 'POST',
      body: payload,
    }),

  upsertTenantOverride: (payload: TenantOverridePayload) =>
    apiFetch<FeatureFlagRecord>(`${BASE}/overrides`, {
      method: 'POST',
      body: payload,
    }),

  resetToSeed: () =>
    apiFetch<FeatureFlagRecord[]>(`${BASE}/reset`, {
      method: 'POST',
    }),

  groupRecords: ({
    flags,
    tenantOptions,
    selectedTenantId,
  }: {
    flags: FeatureFlagRecord[];
    tenantOptions: FeatureFlagTenantOption[];
    selectedTenantId?: number;
  }): FeatureFlagGroup[] => {
    const tenantNameById = new Map(
      tenantOptions.map((tenant) => [tenant.id, tenant.name] as const)
    );
    const selectedTenant = tenantOptions.find(
      (tenant) => tenant.id === selectedTenantId
    );

    if (selectedTenantId !== undefined) {
      const planDefaults = new Map<string, FeatureFlagRecord>();
      const tenantOverrides = new Map<string, FeatureFlagRecord>();

      for (const row of flags) {
        if (row.tenant_id === selectedTenantId) {
          tenantOverrides.set(row.feature_key, row);
        } else if (row.tenant_id === null) {
          planDefaults.set(row.feature_key, row);
        }
      }

      const rows = Array.from(
        new Set([...planDefaults.keys(), ...tenantOverrides.keys()])
      )
        .sort((a, b) => a.localeCompare(b))
        .map((featureKey) => {
          const row =
            tenantOverrides.get(featureKey) ??
            planDefaults.get(featureKey);
          return row
            ? toGroupRow(row, tenantNameById, selectedTenant)
            : null;
        })
        .filter(Boolean) as FeatureFlagGroupRow[];

      return [
        {
          groupKey: `tenant:${selectedTenantId}`,
          groupLabel: selectedTenant
            ? `${selectedTenant.name} overrides`
            : `Tenant #${selectedTenantId} overrides`,
          rows,
        },
      ];
    }

    const grouped = new Map<string, FeatureFlagRecord[]>();
    for (const row of flags) {
      const groupKey =
        row.tenant_id !== null
          ? `tenant:${row.tenant_id}`
          : `plan:${row.plan_tier ?? 'unknown'}`;
      grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), row]);
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupKey, rows]) => ({
        groupKey,
        groupLabel: groupKey.startsWith('tenant:')
          ? getTenantLabel(
              Number(groupKey.replace('tenant:', '')),
              tenantNameById
            )
          : `Plan ${groupKey.replace('plan:', '')}`,
        rows: rows
          .sort((a, b) => a.feature_key.localeCompare(b.feature_key))
          .map((row) => toGroupRow(row, tenantNameById)),
      }));
  },
};
