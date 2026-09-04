export const TENANT_SUBSCRIPTION_UPDATED_EVENT =
  'tenant-subscription-updated';

export function dispatchTenantSubscriptionUpdated() {
  window.dispatchEvent(
    new CustomEvent(TENANT_SUBSCRIPTION_UPDATED_EVENT)
  );
}
