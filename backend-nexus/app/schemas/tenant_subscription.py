from enum import Enum
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class ChangePlanRequest(BaseModel):
    """Request to change subscription plan"""

    new_plan_id: int


class SubscriptionStatsRead(BaseModel):
    """Response with resource usage stats and current plan info"""

    doctors_used: int
    patients_used: int
    departments_used: int
    current_plan_id: Optional[int]
    current_plan_name: Optional[str]


class TenantSubscriptionBase(BaseModel):
    tenant_id: int
    subscription_plan_id: int


class TenantSubscriptionCreate(TenantSubscriptionBase):
    pass


class TenantSubscriptionRead(TenantSubscriptionBase):
    id: int
    status: str
    activated_at: Optional[datetime]
    expires_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    cancellation_reason: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class AdminTenantSubscriptionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class TenantSubscriptionRequestRead(TenantSubscriptionRead):
    admin_status: AdminTenantSubscriptionStatus
    latest_payment_status: Optional[str] = None
    latest_payment_amount: Optional[float] = None


class AdminTenantSubscriptionRead(TenantSubscriptionRequestRead):
    tenant_name: str
    subscription_plan_name: str
    created_at: datetime
    updated_at: datetime
    latest_payment_id: Optional[int] = None


class AdminTenantSubscriptionTransitionRequest(BaseModel):
    target: AdminTenantSubscriptionStatus
    reason: Optional[str] = None
