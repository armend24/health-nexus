export interface TenantAuditLogRead {
  id: number;
  tenant_id: number;
  event_type: string;
  entity_name: string;
  entity_id?: number | null;
  old_value?: Record<string, any> | null;
  new_value?: Record<string, any> | null;
  performed_by_user_id?: number | null;
  performed_by_role?: string | null;
  reason?: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: TenantAuditLogRead[];
  total: number;
  page: number;
  page_size: number;
}
