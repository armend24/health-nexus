export type ContractStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'TERMINATED';

export interface Contract {
  // Backend contract primary key (integer in FastAPI schema).
  id: number;
  // Keep backend snake_case field names so service + UI map 1:1 with API payloads.
  tenant_id: number;
  tenant_name?: string | null;
  doctor_user_id: number;
  doctor_name?: string | null;
  status: ContractStatus;
  salary: string;
  terms_content: string;
  start_date: string;
  end_date: string;
  activated_at?: string | null;
  expires_at?: string | null;
  terms_metadata?: string | null;
  terminated_reason?: string | null;
  doctor_signed_at?: string | null;
  doctor_signature?: string | null;
  hospital_signed_at?: string | null;
  hospital_signature?: string | null;
  created_at: string;
  updated_at: string;
}
