import { apiFetch } from '@/lib/api-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'CANCELLED'
  | 'REFUNDED';

export interface OrderItem {
  id: number;
  product_id: number;
  quantity: number;
  price_at_purchase: number;
  product_name: string;
  line_total: number;
}

export interface Order {
  id: number;
  tenant_id: number;
  patient_user_id: number;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  discount: number;
  total_amount: number;
  items: OrderItem[];
  created_at: string;
}

export interface OrderListResponse {
  items: Order[];
  page: number;
  page_size: number;
  total: number;
}

export interface CreateOrderInput {
  tenant_id: number;
}

export interface OrderListParams {
  tenantId?: number | null;
  status?: OrderStatus | 'ALL';
  page?: number;
  size?: number;
}

export const orderQueryKeys = {
  lists: ['orders'] as const,
  list: (params: OrderListParams) =>
    ['orders', params] as const,
  detail: (orderId: number) => ['order', orderId] as const,
};

export const ordersService = {
  createOrder: (payload: CreateOrderInput) =>
    apiFetch<Order>('/api/orders', {
      method: 'POST',
      body: payload,
    }),
  listOrders: (params: OrderListParams) => {
    const query = new URLSearchParams();
    if (params.tenantId) {
      query.set('tenant_id', String(params.tenantId));
    }
    if (params.status && params.status !== 'ALL') {
      query.set('status', params.status);
    }
    query.set('page', String(params.page ?? 1));
    query.set('size', String(params.size ?? 20));
    return apiFetch<OrderListResponse>(
      `/api/orders?${query.toString()}`
    );
  },
  getOrder: (orderId: number) =>
    apiFetch<Order>(`/api/orders/${orderId}`),
  cancelOrder: (orderId: number) =>
    apiFetch<Order>(`/api/orders/${orderId}/cancel`, {
      method: 'PATCH',
    }),
  refundOrder: (orderId: number) =>
    apiFetch<Order>(`/api/orders/${orderId}/refund`, {
      method: 'PATCH',
    }),
  markOrderPaid: (orderId: number) =>
    apiFetch<Order>(`/api/orders/${orderId}/mark-paid`, {
      method: 'PATCH',
    }),
};

export function useOrders(params: OrderListParams) {
  return useQuery({
    queryKey: orderQueryKeys.list(params),
    queryFn: () => ordersService.listOrders(params),
  });
}

export function useOrder(orderId: number | null) {
  return useQuery({
    queryKey: orderId
      ? orderQueryKeys.detail(orderId)
      : ['order', 'missing'],
    queryFn: () => ordersService.getOrder(orderId!),
    enabled: orderId !== null,
  });
}

function invalidateOrders(
  queryClient: ReturnType<typeof useQueryClient>
) {
  void queryClient.invalidateQueries({
    queryKey: orderQueryKeys.lists,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ordersService.createOrder,
    onSuccess: () => invalidateOrders(queryClient),
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ordersService.cancelOrder,
    onSuccess: (order) => {
      invalidateOrders(queryClient);
      void queryClient.invalidateQueries({
        queryKey: orderQueryKeys.detail(order.id),
      });
    },
  });
}

export function useRefundOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ordersService.refundOrder,
    onSuccess: (order) => {
      invalidateOrders(queryClient);
      void queryClient.invalidateQueries({
        queryKey: orderQueryKeys.detail(order.id),
      });
    },
  });
}

export function useMarkOrderPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ordersService.markOrderPaid,
    onSuccess: (order) => {
      invalidateOrders(queryClient);
      void queryClient.invalidateQueries({
        queryKey: orderQueryKeys.detail(order.id),
      });
    },
  });
}
