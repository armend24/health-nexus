export interface Role {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface RoleCreate {
  name: string;
}

export interface RoleUpdate {
  name?: string;
}
