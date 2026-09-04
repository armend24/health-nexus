from pydantic import BaseModel, ConfigDict, Field

from app.schemas.product import ProductResponse


class CartItemCreate(BaseModel):
    tenant_id: int = Field(..., gt=0)
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)


class CartItemUpdate(BaseModel):
    quantity: int = Field(..., ge=0)


class CartItemResponse(BaseModel):
    id: int
    product_id: int
    quantity: int
    product: ProductResponse
    line_total: float

    model_config = ConfigDict(from_attributes=True)


class CartResponse(BaseModel):
    id: int
    tenant_id: int
    patient_user_id: int
    status: str
    items: list[CartItemResponse]
    subtotal: float

    model_config = ConfigDict(from_attributes=True)
