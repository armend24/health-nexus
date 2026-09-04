from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class AuditEventBase(BaseModel):
    tenant_id: int
    entity_type: str
    entity_id: int
    action: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    actor_user_id: Optional[int] = None


class AuditEventRead(AuditEventBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
