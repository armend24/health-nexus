import type {
  AddUserInput,
  AddUserResponse,
  UsersResponse,
} from '@/interfaces';
import { api } from '@/lib/api-client';

const DUMMY_JSON_USERS = 'https://dummyjson.com/users';

async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export const usersService = {
  list: () => fetchJson<UsersResponse>(DUMMY_JSON_USERS),

  add: (data: AddUserInput) =>
    fetchJson<AddUserResponse>(`${DUMMY_JSON_USERS}/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }),

  getMe: () => api.get<UserRead>('/api/users/me'),

  updateMe: (data: UserUpdate) =>
    api.patch<UserRead>('/api/users/me', data),
};

export interface UserRead {
  id: string | number;
  user_id?: string | number;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  contact?: string | null;
  address?: string | null;
  [key: string]: unknown;
}

export interface UserUpdate {
  first_name?: string;
  last_name?: string;
  contact?: string;
  address?: string;
  password?: string;
}
