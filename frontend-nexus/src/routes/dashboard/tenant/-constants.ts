export const QUERY_KEYS = {
  current: ['tenant-manager', 'current'] as const,
  details: ['tenant-manager', 'details'] as const,
  doctors: ['tenant-manager', 'doctors'] as const,
  contracts: ['tenant-manager', 'contracts'] as const,
  departments: ['tenant-manager', 'departments'] as const,
  products: ['tenant-manager', 'products'] as const,
  fonts: ['tenant-manager', 'fonts'] as const,
  brands: ['tenant-manager', 'brands'] as const,
  departmentCatalog: [
    'tenant-manager',
    'department-catalog',
  ] as const,
};

export const TENANT_SECTION_KEYS = [
  'contracts',
  'departments-services',
  'doctors',
  'enrollments',
  'plans',
  'products',
  'settings',
] as const;

export type TenantSectionKey = (typeof TENANT_SECTION_KEYS)[number];

export function normalizeTenantSection(
  rawSection: string | null | undefined
): TenantSectionKey {
  const section = (rawSection ?? '').trim();
  if ((TENANT_SECTION_KEYS as readonly string[]).includes(section)) {
    return section as TenantSectionKey;
  }
  return 'departments-services';
}

export interface TenantDetailsFormState {
  logo: string;
  image: string;
  moto: string;
  title: string;
  about_text: string;
  brand_id: number | null;
  font_id: number | null;
}

export interface DepartmentDraft {
  local_id: string;
  id?: number;
  department_id: number | null;
  department_name: string;
  phone_number: string;
  email: string;
  location: string;
  isEditing: boolean;
}

export interface ProductFormState {
  name: string;
  description: string;
  price: string;
  stock_quantity: string;
  is_available: boolean;
}

export interface ServiceFormState {
  name: string;
  price: string;
  description: string;
  is_active: boolean;
}

export interface DepartmentFormModalState {
  department_id: number | null;
  phone_number: string;
  email: string;
  location: string;
}
