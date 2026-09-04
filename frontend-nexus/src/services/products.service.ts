import {
  API_BASE_URL,
  ApiError,
  apiFetch,
  getAccessToken,
  type ValidationError,
} from '@/lib/api-client';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

export interface Product {
  product_id: number;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  price: number;
  stock_quantity: number;
  is_available: boolean;
  tenant_id: number;
}

export interface ProductListResponse {
  items: Product[];
  page: number;
  page_size: number;
  total: number;
}

export interface CreateProductInput {
  name: string;
  description?: string | null;
  category?: string | null;
  price: number;
  stock_quantity: number;
  is_available: boolean;
  tenant_id: number;
  image_file?: File | null;
}

export interface UpdateProductInput {
  name?: string;
  description?: string | null;
  category?: string | null;
  price?: number;
  stock_quantity?: number;
  is_available?: boolean;
  image_file?: File | null;
  clear_image?: boolean;
}

export interface ProductListParams {
  tenantId: number;
  page?: number;
  size?: number;
  q?: string;
  category?: string;
  sort?: 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';
  minPrice?: number;
  maxPrice?: number;
}

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
          ? (data as { detail?: string | ValidationError[] }).detail
          : undefined;
      return { detail, data };
    } catch {
      return { detail: undefined, data: undefined };
    }
  }

  try {
    const text = await response.text();
    return { detail: text || undefined, data: text || undefined };
  } catch {
    return { detail: undefined, data: undefined };
  }
}

async function uploadProductMultipart(
  path: string,
  method: 'POST' | 'PUT',
  payload: CreateProductInput | (UpdateProductInput & { productId: number })
): Promise<Product> {
  const formData = new FormData();
  formData.append('name', String(payload.name ?? ''));
  if ('tenant_id' in payload) {
    formData.append('tenant_id', String(payload.tenant_id));
  }
  formData.append('price', String(payload.price ?? 0));
  formData.append(
    'stock_quantity',
    String(payload.stock_quantity ?? 0)
  );
  formData.append(
    'is_available',
    String(payload.is_available ?? true)
  );
  formData.append('description', payload.description ?? '');
  formData.append('category', payload.category ?? '');
  if (payload.image_file) {
    formData.append('image', payload.image_file);
  }
  if ('clear_image' in payload && payload.clear_image) {
    formData.append('clear_image', 'true');
  }

  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `${API_BASE_URL.replace(/\/+$/, '')}${path}`,
    {
      method,
      headers,
      body: formData,
    }
  );

  if (!response.ok) {
    const { detail, data } = await parseUploadError(response);
    throw new ApiError(
      `Request failed: ${response.status} ${response.statusText}`,
      response.status,
      detail,
      data
    );
  }

  return (await response.json()) as Product;
}

export const productQueryKeys = {
  lists: ['products'] as const,
  list: (params: ProductListParams) =>
    [
      'products',
      params.tenantId,
      params.page ?? 1,
      params.size ?? 20,
      params.q ?? '',
      params.category ?? '',
      params.sort ?? '',
      params.minPrice ?? null,
      params.maxPrice ?? null,
    ] as const,
  detail: (productId: number, tenantId?: number | null) =>
    ['product', productId, tenantId ?? null] as const,
};

export const productsService = {
  list: ({
    tenantId,
    page = 1,
    size = 20,
    q,
    category,
    sort,
    minPrice,
    maxPrice,
  }: ProductListParams) => {
    const query = new URLSearchParams({
      tenant_id: String(tenantId),
      page: String(page),
      size: String(size),
    });
    if (q) query.set('q', q);
    if (category) query.set('category', category);
    if (sort) query.set('sort', sort);
    if (minPrice !== undefined) {
      query.set('min_price', String(minPrice));
    }
    if (maxPrice !== undefined) {
      query.set('max_price', String(maxPrice));
    }
    return apiFetch<ProductListResponse>(
      `/api/products?${query.toString()}`
    );
  },
  get: (productId: number, tenantId?: number | null) =>
    apiFetch<Product>(
      `/api/products/${productId}${tenantId ? `?tenant_id=${tenantId}` : ''}`
    ),
  create: (payload: CreateProductInput) =>
    uploadProductMultipart('/api/products/multipart', 'POST', payload),
  update: (productId: number, payload: UpdateProductInput) =>
    uploadProductMultipart(
      `/api/products/${productId}/multipart`,
      'PUT',
      {
        ...payload,
        productId,
      }
    ),
  delete: (productId: number) =>
    apiFetch<void>(`/api/products/${productId}`, {
      method: 'DELETE',
      skipJson: true,
    }),
};

export function useProducts(params: ProductListParams | null) {
  return useQuery({
    queryKey: params
      ? productQueryKeys.list(params)
      : ['products', 'missing-tenant'],
    queryFn: () => productsService.list(params!),
    enabled: params !== null,
    placeholderData: keepPreviousData,
  });
}

export function useProduct(
  productId: number | null,
  tenantId?: number | null
) {
  return useQuery({
    queryKey: productId
      ? productQueryKeys.detail(productId, tenantId)
      : ['product', 'missing'],
    queryFn: () => productsService.get(productId!, tenantId),
    enabled: productId !== null,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: productsService.create,
    onSuccess: (product) => {
      void queryClient.invalidateQueries({
        queryKey: productQueryKeys.lists,
      });
      void queryClient.invalidateQueries({
        queryKey: productQueryKeys.detail(product.product_id),
      });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      payload,
    }: {
      productId: number;
      payload: UpdateProductInput;
    }) => productsService.update(productId, payload),
    onSuccess: (product) => {
      void queryClient.invalidateQueries({
        queryKey: productQueryKeys.lists,
      });
      void queryClient.invalidateQueries({
        queryKey: productQueryKeys.detail(product.product_id),
      });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
    }: {
      productId: number;
      tenantId: number;
    }) => productsService.delete(productId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: productQueryKeys.lists,
      });
    },
  });
}
