import type {
  BrandPaletteRead,
  DepartmentRead,
  DoctorAssignableRead,
  DoctorCreateForTenant,
  DoctorRead,
  DoctorUpdate,
  FontRead,
  ProductCreateForTenant,
  ProductRead,
  ProductUpdateInput,
  ServiceCreateInput,
  ServiceLandingItem,
  ServiceRead,
  ServiceUpdateInput,
  TenantCreate,
  TenantCurrentRead,
  TenantDepartmentWithServicesRead,
  TenantDepartmentsBulkRequest,
  TenantDetailsMultipartUpdate,
  TenantDetailsRead,
  TenantDetailsUpdate,
  TenantLandingPageResponse,
  TenantListResponse,
  TenantPublicCard,
  TenantRead,
  TenantStatus,
} from '@/interfaces';
import {
  API_BASE_URL,
  ApiError,
  api,
  getAccessToken,
  type ValidationError,
} from '@/lib/api-client';

async function parseUploadError(response: Response): Promise<{
  detail?: string | ValidationError[];
  data?: unknown;
}> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.toLowerCase().includes('application/json')) {
    try {
      const data = (await response.json()) as unknown;
      const detail =
        typeof data === 'object' && data !== null && 'detail' in data
          ? (
              data as {
                detail?: string | ValidationError[];
              }
            ).detail
          : undefined;
      return { detail, data };
    } catch {
      return {
        detail: undefined,
        data: undefined,
      };
    }
  }

  try {
    const text = await response.text();
    return {
      detail: text || undefined,
      data: text || undefined,
    };
  } catch {
    return { detail: undefined, data: undefined };
  }
}

async function updateTenantDetailsMultipart(
  data: TenantDetailsMultipartUpdate
): Promise<TenantDetailsRead> {
  const formData = new FormData();

  if (data.logo_file) formData.append('logo', data.logo_file);
  if (data.image_file) formData.append('image', data.image_file);
  if (data.logo !== undefined)
    formData.append('logo_url', data.logo ?? '');
  if (data.image !== undefined)
    formData.append('image_url', data.image ?? '');
  if (data.clear_logo) formData.append('clear_logo', 'true');
  if (data.clear_image) formData.append('clear_image', 'true');

  if (data.moto !== undefined)
    formData.append('moto', data.moto ?? '');
  if (data.title !== undefined)
    formData.append('title', data.title ?? '');
  if (data.about_text !== undefined)
    formData.append('about_text', data.about_text ?? '');
  if (data.brand_id !== undefined && data.brand_id !== null) {
    formData.append('brand_id', String(data.brand_id));
  }
  if (data.font_id !== undefined && data.font_id !== null) {
    formData.append('font_id', String(data.font_id));
  }

  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${API_BASE_URL.replace(/\/+$/, '')}/api/tenants/details`;
  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const { detail, data: errorData } =
      await parseUploadError(response);
    throw new ApiError(
      `Request failed: ${response.status} ${response.statusText}`,
      response.status,
      detail,
      errorData
    );
  }

  return (await response.json()) as TenantDetailsRead;
}

export type PublicLeadTrackingStepState =
  | 'DONE'
  | 'IN_PROGRESS'
  | 'NOT_STARTED';

export interface PublicLeadTrackingStep {
  status: string;
  state: PublicLeadTrackingStepState;
}

export interface PublicLeadTrackingResponse {
  lead_id: number;
  organization_name: string | null;
  contact_email: string | null;
  current_status: string;
  created_at: string;
  updated_at: string;
  roadmap: PublicLeadTrackingStep[];
}

/**
 * Tenant service for public and superadmin tenant operations
 */
export const tenantsService = {
  /**
   * List approved tenants for public display (e.g. tenant selector). No auth.
   */
  listPublicTenants: () =>
    api.get<TenantPublicCard[]>('/api/tenants'),

  /**
   * List approved tenants where the current user is enrolled.
   */
  //listEnrolledTenants: () => api.get<TenantPublicCard[]>("/api/tenants/enrolled"),

  /**
   * Get full landing page data for a tenant by slug (public). No auth.
   */
  getLandingBySlug: (slug: string) =>
    api.get<TenantLandingPageResponse>(
      `/api/tenants/by-slug/${encodeURIComponent(slug)}/landing`
    ),

  /**
   * Submit a tenant application to join the platform
   * @param data - Tenant application data (name, email, licence_number)
   * @returns Promise with created tenant (status: pending)
   */
  createApplication: (data: TenantCreate) =>
    api.post<TenantRead>('/api/public/tenants', data),

  /**
   * Submit a public consultation request (creates a lead in backend).
   * Current backend accepts tenant_name, contact_email, description.
   * Frontend augments this in a local placeholder store with extra fields
   * until dedicated lead CRUD endpoints are available.
   */
  createConsultationRequest: (data: {
    tenant_name: string;
    contact_email: string;
    description?: string;
  }) => api.post('/api/public/tenants/consultation', data),

  /**
   * Public lead tracking lookup used by consultation requester (no login required).
   * Caller must provide lead_id and the same email used during consultation request.
   */
  trackConsultationRequest: (params: {
    lead_id: number;
    email: string;
  }) =>
    api.get<PublicLeadTrackingResponse>(
      `/api/public/tenants/consultation/track?lead_id=${encodeURIComponent(String(params.lead_id))}&email=${encodeURIComponent(params.email)}`
    ),

  /**
   * List tenants for superadmin dashboard with optional status filter and pagination
   * @param status - Optional status filter (pending, approved, rejected, suspended, archived)
   * @param search - Optional search term for tenant name
   * @param page - Page number (default 1)
   * @param page_size - Items per page (default 10, max 100)
   * @returns Promise with paginated tenants response
   */
  list: (params?: {
    status?: TenantStatus;
    search?: string;
    page?: number;
    page_size?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }
    if (params?.page) {
      queryParams.append('page', String(params.page));
    }
    if (params?.page_size) {
      queryParams.append('page_size', String(params.page_size));
    }
    const queryString = queryParams.toString();
    return api.get<TenantListResponse>(
      `/api/superadmin/tenants${queryString ? `?${queryString}` : ''}`
    );
  },

  /**
   * Update tenant status (approve, reject, suspend, archive)
   * @param tenantId - Tenant ID
   * @param status - New status for the tenant
   * @param reason - Optional reason for status change
   * @returns Promise with updated tenant
   */
  updateStatus: (
    tenantId: number,
    status: TenantStatus,
    reason?: string
  ) => {
    return api.patch<TenantRead>(
      `/api/superadmin/tenants/${tenantId}/status`,
      {
        status,
        reason,
      }
    );
  },

  /** List fonts for tenant branding dropdown (no auth). */
  listFonts: () => api.get<FontRead[]>('/api/fonts'),

  /** List brand palettes for tenant branding cards (no auth). */
  listBrands: () => api.get<BrandPaletteRead[]>('/api/brands'),

  /** List global departments for tenant department assignment (no auth). */
  listDepartmentCatalog: () =>
    api.get<DepartmentRead[]>('/api/departments'),

  // Tenant manager (JWT-scoped) endpoints
  getCurrentTenant: () =>
    api.get<TenantCurrentRead>('/api/tenants/current'),
  getTenantDetails: () =>
    api.get<TenantDetailsRead>('/api/tenants/details'),
  updateTenantDetails: (
    data: TenantDetailsMultipartUpdate | TenantDetailsUpdate
  ) => updateTenantDetailsMultipart(data),
  listTenantDoctors: () =>
    api.get<DoctorRead[]>('/api/tenants/doctors'),
  listAssignableDoctors: (excludeTenantId: number) =>
    api.get<DoctorAssignableRead[]>(
      `/api/users/doctors?exclude_tenant_id=${encodeURIComponent(String(excludeTenantId))}`
    ),
  createTenantDoctor: (data: DoctorCreateForTenant) =>
    api.post<DoctorRead>('/api/tenants/doctors', data),
  updateTenantDoctor: (userId: number, data: DoctorUpdate) =>
    api.put<DoctorRead>(`/api/tenants/doctors/${userId}`, data),
  deleteTenantDoctor: (userId: number) =>
    api.delete<void>(`/api/tenants/doctors/${userId}`),
  listTenantDepartments: () =>
    api.get<TenantDepartmentWithServicesRead[]>(
      '/api/tenants/departments'
    ),
  replaceTenantDepartments: (data: TenantDepartmentsBulkRequest) =>
    api.post<TenantDepartmentWithServicesRead[]>(
      '/api/tenants/departments',
      data
    ),
  listTenantProducts: () =>
    api.get<ProductRead[]>('/api/tenants/products'),
  createTenantProduct: (data: ProductCreateForTenant) =>
    api.post<ProductRead>('/api/tenants/products', data),
  updateTenantProduct: (
    productId: number,
    data: ProductUpdateInput
  ) =>
    api.put<ProductRead>(`/api/tenants/products/${productId}`, data),
  deleteTenantProduct: (productId: number) =>
    api.delete<void>(`/api/tenants/products/${productId}`),

  // Services (per tenant department)
  listServices: (tenantDepartmentId: number) =>
    api.get<ServiceLandingItem[]>(
      `/api/services?tenant_department_id=${encodeURIComponent(String(tenantDepartmentId))}`
    ),
  createService: (data: ServiceCreateInput) =>
    api.post<ServiceRead>('/api/services', data),
  updateService: (serviceId: number, data: ServiceUpdateInput) =>
    api.put<ServiceRead>(`/api/services/${serviceId}`, data),
  deleteService: (serviceId: number) =>
    api.delete<void>(`/api/services/${serviceId}`),
};
