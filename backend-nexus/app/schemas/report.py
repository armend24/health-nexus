# app/schemas/report.py

from pydantic import BaseModel, ConfigDict
from datetime import datetime


class ReportBase(BaseModel):
    appointment_id: int
    diagnosis: str | None = None
    description: str | None = None
    medicine: str | None = None
    doctor_user_id: int
    patient_user_id: int
    tenant_id: int


class ReportCreate(ReportBase):
    pass


class ReportRead(ReportBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
