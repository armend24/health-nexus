from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime

from app.models.appointment import AppointmentStatus


class AppointmentCreate(BaseModel):
    tenant_id: int
    doctor_id: int
    department_id: int

    appointment_datetime: datetime
    duration_minutes: int = Field(default=30, ge=1)

    description: str | None = None


class AppointmentBase(BaseModel):
    appointment_datetime: datetime | None = None
    description: str | None = None

    doctor_user_id: int
    patient_user_id: int
    tenant_id: int

    status: AppointmentStatus = AppointmentStatus.REQUESTED


class AppointmentUpdate(BaseModel):
    appointment_datetime: datetime | None = None
    description: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1)
    status: AppointmentStatus | None = None


class AppointmentRead(BaseModel):
    id: int

    appointment_datetime: datetime | None
    description: str | None
    duration_minutes: int

    doctor_user_id: int
    patient_user_id: int
    tenant_id: int

    status: AppointmentStatus

    created_at: datetime
    updated_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
