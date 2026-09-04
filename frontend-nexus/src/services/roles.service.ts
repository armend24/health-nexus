import type { Role, RoleCreate, RoleUpdate } from '@/interfaces';
import { apiFetch } from '@/lib/api-client';

const BASE = '/roles';

export const rolesService = {
  list: (params?: { skip?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.skip != null) search.set('skip', String(params.skip));
    if (params?.limit != null)
      search.set('limit', String(params.limit));
    const qs = search.toString();
    return apiFetch<Role[]>(qs ? `${BASE}?${qs}` : BASE, {
      method: 'GET',
    });
  },

  getById: (id: number) =>
    apiFetch<Role>(`${BASE}/${id}`, {
      method: 'GET',
    }),

  create: (data: RoleCreate) =>
    apiFetch<Role>(BASE, {
      method: 'POST',
      body: data,
    }),

  update: (id: number, data: RoleUpdate) =>
    apiFetch<Role>(`${BASE}/${id}`, {
      method: 'PUT',
      body: data,
    }),

  delete: (id: number) =>
    apiFetch<void>(`${BASE}/${id}`, {
      method: 'DELETE',
      skipJson: true,
    }),
};
