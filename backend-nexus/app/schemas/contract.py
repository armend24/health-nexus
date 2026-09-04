from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.config import get_api_base_url


def _signature_to_url(value: Optional[str], contract_id: int, role: str) -> Optional[str]:
    """Return full URL for signature image. Handles legacy base64."""
    if not value:
        return None
    if value.startswith("data:"):
        return value  # Legacy base64 data URL
    # Storage path like signatures/contract_1_doctor_xxx.png → full URL
    base = get_api_base_url()
    return f"{base}/uploads/{value}"


class ContractBase(BaseModel):
    doctor_user_id: Optional[int] = None
    salary: Optional[Decimal] = None
    terms_content: Optional[str] = None
    terms_metadata: Optional[dict[str, Any]] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    activated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class ContractCreate(ContractBase):
    doctor_user_id: Optional[int] = Field(
        None, description="Doctor user_id (required when creating contract for a doctor)"
    )


class ContractRead(ContractBase):
    id: int
    tenant_id: int
    tenant_name: Optional[str] = None
    doctor_name: Optional[str] = None
    status: str
    terminated_reason: Optional[str] = None
    doctor_signed_at: Optional[datetime] = None
    doctor_signature: Optional[str] = None
    hospital_signed_at: Optional[datetime] = None
    hospital_signature: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("doctor_signature")
    def serialize_doctor_signature(self, v: Optional[str]) -> Optional[str]:
        return _signature_to_url(v, self.id, "doctor")

    @field_serializer("hospital_signature")
    def serialize_hospital_signature(self, v: Optional[str]) -> Optional[str]:
        return _signature_to_url(v, self.id, "hospital")


class ContractUpdate(BaseModel):
    doctor_user_id: Optional[int] = None
    salary: Optional[Decimal] = None
    terms_content: Optional[str] = None
    terms_metadata: Optional[dict[str, Any]] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    activated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class ContractTransition(BaseModel):
    next_status: str = Field(..., pattern="^(ACTIVE|EXPIRED|TERMINATED)$")
    reason: Optional[str] = None


# Sign endpoints use multipart form-data with File upload (see routes)
