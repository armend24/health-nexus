from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List


class TenantAuditLogRead(BaseModel):
    id: int
    tenant_id: int
    event_type: str
    entity_name: str
    entity_id: int | None
    old_value: dict | None
    new_value: dict | None
    performed_by_user_id: int | None
    performed_by_role: str | None
    reason: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditLogListResponse(BaseModel):
    items: List[TenantAuditLogRead]
    total: int
    page: int
    page_size: int
