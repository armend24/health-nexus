/**
 * Tenant interfaces matching backend schemas
 */
import type { ServiceLandingItem } from './landing';

/** Status of a tenant application/account */
export enum TenantStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

/** Font option for tenant branding */
export interface FontRead {
  id: number;
  name: string;
  header_font_family: string;
  body_font_family: string;
  sort_order: number;
  created_at: string;
}

/** Brand palette option for tenant branding cards */
export interface BrandPaletteRead {
  id: number;
  name: string;
  brand_color_primary: string;
  brand_color_secondary: string;
  brand_color_background: string;
  brand_color_foreground: string;
  brand_color_muted: string;
  sort_order: number;
  created_at: string;
}

/** Global department catalog option */
export interface DepartmentRead {
  id: number;
  name: string;
  created_at: string;
  updated_at?: string | null;
}

/** Data required to create a tenant application */
export interface TenantCreate {
  name: string;
  email: string;
  licence_number: string;
}

/** Full tenant details returned from backend */
export interface TenantRead extends TenantCreate {
  id: number;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

/** Paginated list of tenants from superadmin API */
export interface TenantListResponse {
  items: TenantRead[];
  total: number;
  page: number;
  page_size: number;
}

/** Tenant manager's current tenant (JWT-derived tenant context) */
export interface TenantCurrentRead {
  id: number;
  name: string;
  email: string;
  licence_number: string;
  slug?: string | null;
  status?: TenantStatus | string;
  created_at?: string;
  updated_at?: string;
}

/** Tenant details for tenant manager edit screen */
export interface TenantDetailsRead {
  tenant_id: number;
  logo?: string | null;
  image?: string | null;
  moto?: string | null;
  brand_id?: number | null;
  title?: string | null;
  slogan?: string | null;
  about_text?: string | null;
  font_key?: string | null;
  font_id?: number | null;
  created_at?: string;
  updated_at?: string | null;
}

/** Partial update payload for tenant details */
export interface TenantDetailsUpdate {
  logo?: string | null;
  image?: string | null;
  moto?: string | null;
  brand_id?: number | null;
  font_id?: number | null;
  title?: string | null;
  slogan?: string | null;
  about_text?: string | null;
  font_key?: string | null;
}

/** Multipart update payload for tenant details, supports file upload for logo/hero image. */
export interface TenantDetailsMultipartUpdate extends TenantDetailsUpdate {
  logo_file?: File | null;
  image_file?: File | null;
  clear_logo?: boolean;
  clear_image?: boolean;
}

/** Read-only doctors list on tenant manager page (includes name for dropdowns) */
export interface DoctorRead {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  specialization?: string | null;
  education?: string | null;
  licence_number?: string | null;
  tenant_id: number;
  working_hours?: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

/** Payload to assign/add a doctor to tenant */
export interface DoctorCreateForTenant {
  user_id: number;
  specialization?: string | null;
  education?: string | null;
  licence_number?: string | null;
  working_hours?: Record<string, unknown> | null;
}

/** Payload to update a doctor */
export interface DoctorUpdate {
  specialization?: string | null;
  education?: string | null;
  licence_number?: string | null;
  working_hours?: Record<string, unknown> | null;
  is_active?: boolean | null;
}

/** User with DOCTOR role for add-doctor dropdown (from GET /api/users/doctors) */
export interface DoctorAssignableRead {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  assigned_tenant_id: number | null;
}

export interface TenantDepartmentBulkItem {
  department_id: number;
  phone_number?: string | null;
  email?: string | null;
  location?: string | null;
}

export interface TenantDepartmentsBulkRequest {
  items: TenantDepartmentBulkItem[];
}

/** Tenant department row + nested landing services */
export interface TenantDepartmentWithServicesRead {
  id: number;
  tenant_id: number;
  department_id: number;
  phone_number?: string | null;
  email?: string | null;
  location?: string | null;
  created_at: string;
  updated_at?: string | null;
  department_name: string;
  services: ServiceLandingItem[];
}

/** Service CRUD responses (create/update include tenant fields) */
export interface ServiceRead {
  id: number;
  name: string;
  price: number;
  description?: string | null;
  tenant_departments_id: number;
  tenant_id: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface ServiceCreateInput {
  tenant_department_id: number;
  name: string;
  price: number;
  description?: string | null;
}

export interface ServiceUpdateInput {
  name?: string;
  price?: number;
  description?: string | null;
  is_active?: boolean;
}

export interface ProductRead {
  product_id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  price: number;
  stock_quantity: number;
  is_available?: boolean | null;
}

export interface ProductCreateForTenant {
  name: string;
  description?: string | null;
  price: number;
  stock_quantity: number;
  is_available: boolean;
}

export interface ProductUpdateInput {
  name?: string;
  description?: string | null;
  price?: number;
  stock_quantity?: number;
  is_available?: boolean;
}
