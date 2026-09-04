from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from app.models.consultation_booking import ConsultationStatus


class ConsultationBase(BaseModel):
    lead_id: int
    scheduled_at: datetime
    duration_minutes: int | None = Field(None, gt=0, le=60)
    meeting_link: str | None = None
    location: str | None = None
    status: ConsultationStatus = ConsultationStatus.SCHEDULED
    created_by_user_id: int | None = None


class ConsultationCreate(ConsultationBase):
    pass


class ConsultationUpdate(BaseModel):
    status: ConsultationStatus | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None


class ConsultationRead(ConsultationBase):
    id: int
    completed_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
