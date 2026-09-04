from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import date


class PatientBase(BaseModel):
    birthdate: date | None = None
    gender: str | None = None
    blood_type: str | None = None


class PatientCreate(PatientBase):
    tenant_id: int
    user_id: int


class PatientUpdate(PatientBase):
    pass


class PatientRead(PatientBase):
    tenant_id: int
    user_id: int

    class Config:
        from_attributes = True


class ClientRegistrationRequest(PatientBase):
    email: EmailStr
    first_name: str | None = None
    last_name: str | None = None
    password: str | None = None
    model_config = ConfigDict(extra="ignore")


class ClientRegistrationResponse(BaseModel):
    user_id: int
    patient_id: int
    tenant_id: int
    model_config = ConfigDict(from_attributes=True)
