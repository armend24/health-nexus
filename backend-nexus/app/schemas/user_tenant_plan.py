from datetime import timedelta
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UserTenantPlanBase(BaseModel):
    tenant_id: int
    name: str
    description: Optional[str] = None

    # Global pricing bounds; tenant-specific bounds are enforced in route logic.
    price: Decimal = Field(..., gt=0, le=100000)

    duration: Optional[int] = Field(None, gt=0)

    max_appointments: Optional[int] = Field(None, gt=0)
    max_consultations: Optional[int] = Field(None, gt=0)
    is_active: Optional[bool] = True


class UserTenantPlanCreate(UserTenantPlanBase):
    pass


class UserTenantPlanRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    description: Optional[str] = None
    # Allow price >= 0 so free plans (price=0) serialise without error
    price: Decimal = Field(..., ge=0, le=100000)
    duration: Optional[int] = Field(None, gt=0)
    max_appointments: Optional[int] = Field(None, gt=0)
    max_consultations: Optional[int] = Field(None, gt=0)
    is_active: Optional[bool] = True

    model_config = ConfigDict(from_attributes=True)


class UserTenantPlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = Field(None, gt=0, le=100000)
    duration: Optional[int] = Field(None, gt=0)
    max_appointments: Optional[int] = Field(None, gt=0)
    max_consultations: Optional[int] = Field(None, gt=0)
    is_active: Optional[bool] = None
