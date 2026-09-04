from pydantic import BaseModel, ConfigDict
from datetime import datetime
from app.models.lead import LeadStatus


class LeadStatusHistoryRead(BaseModel):
    id: int
    lead_id: int
    old_status: LeadStatus | None
    new_status: LeadStatus
    changed_by_user_id: int | None
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)
