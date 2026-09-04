from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DoctorBase(BaseModel):
    specialization: Optional[str]
    education: Optional[str]
    licence_number: Optional[str]
    tenant_id: int
    working_hours: Optional[dict]


class DoctorCreate(DoctorBase):
    user_id: int


class AssignDoctorRequest(BaseModel):
    user_id: int


class DoctorCreateForTenant(BaseModel):
    """Create/assign doctor to tenant. tenant_id from JWT."""

    user_id: int
    specialization: Optional[str] = None
    education: Optional[str] = None
    licence_number: Optional[str] = None
    working_hours: Optional[dict] = None


class DoctorUpdate(BaseModel):
    specialization: Optional[str] = None
    education: Optional[str] = None
    licence_number: Optional[str] = None
    working_hours: Optional[dict] = None
    is_active: Optional[bool] = None


class DoctorRead(DoctorBase):
    user_id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DoctorReadWithName(DoctorRead):
    """Doctor with user name for dropdowns (e.g. contract doctor selection)."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
