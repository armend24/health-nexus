export const PRODUCT_CATEGORY_OPTIONS = [
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'first-aid', label: 'First Aid' },
  { value: 'home-monitoring', label: 'Home Monitoring' },
  { value: 'medical-devices', label: 'Medical Devices' },
  { value: 'mobility-aids', label: 'Mobility Aids' },
  { value: 'personal-care', label: 'Personal Care' },
  { value: 'protective-equipment', label: 'Protective Equipment' },
  { value: 'supplements', label: 'Supplements' },
  { value: 'vitamins', label: 'Vitamins' },
  { value: 'wellness-essentials', label: 'Wellness Essentials' },
] as const;

export function getProductCategoryLabel(
  category: string | null | undefined
): string | null {
  if (!category) return null;
  const normalized = category.trim().toLowerCase();
  const match = PRODUCT_CATEGORY_OPTIONS.find(
    (option) => option.value === normalized
  );
  return match?.label ?? category;
}
