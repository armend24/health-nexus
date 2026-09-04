import type { OrderStatus } from '@/services/orders.service';

const ACTIVE_TENANT_KEY = 'health-nexus.activeTenantId';

function parseTenantId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function getStoredActiveTenantId(): number | null {
  try {
    return parseTenantId(
      globalThis.localStorage?.getItem(ACTIVE_TENANT_KEY) ??
        undefined
    );
  } catch {
    return null;
  }
}

export function getActiveTenantId(
  tenantIdFromStore?: string
): number | null {
  const storeTenantId = parseTenantId(tenantIdFromStore);
  if (storeTenantId !== null) return storeTenantId;
  return getStoredActiveTenantId();
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function getOrderBadgeVariant(
  status: OrderStatus
): 'warning' | 'success' | 'destructive' | 'neutral' {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'PAID':
      return 'success';
    case 'CANCELLED':
      return 'destructive';
    case 'REFUNDED':
      return 'neutral';
    default:
      return 'neutral';
  }
}
