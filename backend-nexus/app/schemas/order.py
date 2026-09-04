from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OrderCreate(BaseModel):
    tenant_id: int = Field(..., gt=0)


class OrderItemResponse(BaseModel):
    id: int
    product_id: int
    quantity: int
    price_at_purchase: float
    product_name: str
    line_total: float

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    id: int
    tenant_id: int
    patient_user_id: int
    status: str
    subtotal: float
    tax: float
    discount: float
    total_amount: float
    items: list[OrderItemResponse]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderListResponse(BaseModel):
    items: list[OrderResponse]
    page: int
    page_size: int
    total: int
