from pydantic import BaseModel, ConfigDict
from datetime import datetime
from app.models.appointment import AppointmentStatus


class AppointmentStatusHistoryRead(BaseModel):
    id: int
    appointment_id: int
    old_status: AppointmentStatus | None
    new_status: AppointmentStatus
    changed_by: int | None
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)
