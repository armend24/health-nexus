import { apiFetch } from '@/lib/api-client';
import type { Product } from '@/services/products.service';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

export interface CartItem {
  id: number;
  product_id: number;
  quantity: number;
  product: Product;
  line_total: number;
}

export interface Cart {
  id: number;
  tenant_id: number;
  patient_user_id: number;
  status: string;
  items: CartItem[];
  subtotal: number;
}

export interface AddCartItemInput {
  tenant_id: number;
  product_id: number;
  quantity: number;
}

export interface UpdateCartItemInput {
  quantity: number;
}

export const cartQueryKeys = {
  cart: (tenantId: number) => ['cart', tenantId] as const,
};

export const cartService = {
  getCart: (tenantId: number) =>
    apiFetch<Cart>(`/api/cart?tenant_id=${tenantId}`),
  addItem: (payload: AddCartItemInput) =>
    apiFetch<Cart>('/api/cart/items', {
      method: 'POST',
      body: payload,
    }),
  updateItem: (itemId: number, payload: UpdateCartItemInput) =>
    apiFetch<Cart>(`/api/cart/items/${itemId}`, {
      method: 'PUT',
      body: payload,
    }),
  removeItem: (itemId: number) =>
    apiFetch<void>(`/api/cart/items/${itemId}`, {
      method: 'DELETE',
      skipJson: true,
    }),
  clearCart: (tenantId: number) =>
    apiFetch<void>(`/api/cart?tenant_id=${tenantId}`, {
      method: 'DELETE',
      skipJson: true,
    }),
};

export function useCart(tenantId: number | null) {
  return useQuery({
    queryKey: tenantId
      ? cartQueryKeys.cart(tenantId)
      : ['cart', 'missing-tenant'],
    queryFn: () => cartService.getCart(tenantId!),
    enabled: tenantId !== null,
  });
}

function invalidateCart(
  queryClient: ReturnType<typeof useQueryClient>,
  tenantId: number
) {
  void queryClient.invalidateQueries({
    queryKey: cartQueryKeys.cart(tenantId),
  });
}

export function useAddCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cartService.addItem,
    onSuccess: (_, variables) => {
      invalidateCart(queryClient, variables.tenant_id);
    },
  });
}

export function useUpdateCartItem(tenantId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: number;
      payload: UpdateCartItemInput;
    }) => cartService.updateItem(itemId, payload),
    onSuccess: () => {
      if (tenantId !== null) invalidateCart(queryClient, tenantId);
    },
  });
}

export function useRemoveCartItem(tenantId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: number) => cartService.removeItem(itemId),
    onSuccess: () => {
      if (tenantId !== null) invalidateCart(queryClient, tenantId);
    },
  });
}

export function useClearCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cartService.clearCart,
    onSuccess: (_, tenantId) => {
      invalidateCart(queryClient, tenantId);
    },
  });
}
