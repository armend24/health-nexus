from pydantic import BaseModel, ConfigDict
from datetime import datetime
from enum import Enum
from typing import Optional


class EnrollmentStatus(str, Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class EnrollmentBase(BaseModel):
    tenant_id: int
    patient_user_id: int
    user_tenant_plan_id: int
    created_by: int


class EnrollmentCreate(EnrollmentBase):
    pass


class EnrollmentRead(EnrollmentBase):
    id: int
    status: EnrollmentStatus
    patient_user_id: int
    user_tenant_plan_id: int

    activated_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EnrollmentDetailRead(BaseModel):
    """Enriched enrollment view for the tenant manager dashboard."""

    id: int
    status: EnrollmentStatus
    patient_user_id: int
    patient_email: Optional[str] = None
    patient_first_name: Optional[str] = None
    patient_last_name: Optional[str] = None
    plan_id: int
    plan_name: str
    activated_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    expires_at: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class EnrollmentCreateRequest(BaseModel):
    patient_user_id: int
    user_tenant_plan_id: int


class EnrollmentStatusRead(BaseModel):
    id: int
    status: EnrollmentStatus
    patient_user_id: int
    user_tenant_plan_id: int
    tenant_id: int
    activated_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    expires_at: Optional[str] = None
    updated_at: Optional[str] = None


class EnrollmentOperationalStatus(BaseModel):
    enrollment_id: int
    status: EnrollmentStatus
    isActive: bool
    expires_at: Optional[str] = None
    isExpired: bool
    last_updated: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
