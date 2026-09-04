export type CheckoutRecoveryKind =
  | 'enrollment'
  | 'tenant-subscription';

export type CheckoutRecoveryPhase =
  | 'collecting_payment'
  | 'processing'
  | 'awaiting_approval'
  | 'attention_required';

export interface CheckoutRecoveryRecord {
  kind: CheckoutRecoveryKind;
  tenantId: number;
  planId: number;
  paymentId: number;
  referenceId: number;
  phase: CheckoutRecoveryPhase;
  startedAt: string;
  updatedAt: string;
  clientSecret?: string | null;
}

const STORAGE_KEYS: Record<CheckoutRecoveryKind, string> = {
  enrollment: 'health-nexus.checkout-recovery.enrollment',
  'tenant-subscription':
    'health-nexus.checkout-recovery.tenant-subscription',
};

const MAX_RECOVERY_AGE_MS = 24 * 60 * 60 * 1000;

function getStorageKey(kind: CheckoutRecoveryKind): string {
  return STORAGE_KEYS[kind];
}

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (!globalThis.localStorage) return;
    if (value === null) {
      globalThis.localStorage.removeItem(key);
      return;
    }
    globalThis.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function isExpired(record: CheckoutRecoveryRecord): boolean {
  const startedAt = Date.parse(record.startedAt);
  if (Number.isNaN(startedAt)) return true;
  return Date.now() - startedAt > MAX_RECOVERY_AGE_MS;
}

export function loadCheckoutRecovery(
  kind: CheckoutRecoveryKind
): CheckoutRecoveryRecord | null {
  const raw = readStorage(getStorageKey(kind));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CheckoutRecoveryRecord;
    if (
      !parsed ||
      parsed.kind !== kind ||
      typeof parsed.paymentId !== 'number' ||
      typeof parsed.planId !== 'number' ||
      typeof parsed.referenceId !== 'number' ||
      typeof parsed.tenantId !== 'number'
    ) {
      writeStorage(getStorageKey(kind), null);
      return null;
    }

    if (isExpired(parsed)) {
      writeStorage(getStorageKey(kind), null);
      return null;
    }

    return parsed;
  } catch {
    writeStorage(getStorageKey(kind), null);
    return null;
  }
}

export function saveCheckoutRecovery(
  record: CheckoutRecoveryRecord
): CheckoutRecoveryRecord {
  const normalized = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  writeStorage(
    getStorageKey(record.kind),
    JSON.stringify(normalized)
  );
  return normalized;
}

export function clearCheckoutRecovery(kind: CheckoutRecoveryKind) {
  writeStorage(getStorageKey(kind), null);
}
