from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class EnrollmentStatusHistoryBase(BaseModel):
    enrollment_id: int
    tenant_id: int
    old_status: str
    new_status: str
    changed_by: Optional[int] = None
    changed_by_role: Optional[str] = None
    reason: Optional[str] = None


class EnrollmentStatusHistoryCreate(EnrollmentStatusHistoryBase):
    pass


class EnrollmentStatusHistoryRead(EnrollmentStatusHistoryBase):
    id: int
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)
