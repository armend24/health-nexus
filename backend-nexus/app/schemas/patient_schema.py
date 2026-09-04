from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.tenant import TenantStatus


class MyTenantSummaryResponse(BaseModel):
    tenant_id: int
    name: str
    status: TenantStatus

    model_config = ConfigDict(from_attributes=True)


class PatientMeResponse(BaseModel):
    tenant_id: int
    user_id: int
    birthdate: date | None = None
    gender: str | None = None
    blood_type: str | None = None

    model_config = ConfigDict(from_attributes=True)


class PatientMeUpdateRequest(BaseModel):
    birthdate: date | None = None
    gender: str | None = None
    blood_type: str | None = None
