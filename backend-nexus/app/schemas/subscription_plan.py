from pydantic import BaseModel, Field
from decimal import Decimal
from typing import Optional
from datetime import datetime


class SubscriptionPlanBase(BaseModel):
    name: str = Field(..., max_length=100, example="Basic Plan")
    price: Decimal = Field(..., ge=0, example=99.99)
    duration: int = Field(..., gt=0, description="Duration in days", example=30)

    max_doctors: Optional[int] = Field(None, example=5)
    max_patients: Optional[int] = Field(None, example=100)
    max_departments: Optional[int] = Field(None, example=3)


class SubscriptionPlanCreate(SubscriptionPlanBase):
    pass


class SubscriptionPlanUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    price: Optional[Decimal] = Field(None, ge=0)
    duration: Optional[int] = Field(None, gt=0)

    max_doctors: Optional[int] = None
    max_patients: Optional[int] = None
    max_departments: Optional[int] = None


class SubscriptionPlanRead(SubscriptionPlanBase):
    id: int

    model_config = {"from_attributes": True}
