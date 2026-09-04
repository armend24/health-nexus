from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=100)
    image_url: Optional[str] = Field(default=None, max_length=1024)
    price: Decimal = Field(..., ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    is_available: bool = True
    tenant_id: int = Field(..., gt=0)


class ProductCreateForTenant(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=100)
    image_url: Optional[str] = Field(default=None, max_length=1024)
    price: Decimal = Field(..., ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    is_available: bool = True


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=100)
    image_url: Optional[str] = Field(default=None, max_length=1024)
    price: Optional[Decimal] = Field(default=None, ge=0)
    stock_quantity: Optional[int] = Field(default=None, ge=0)
    is_available: Optional[bool] = None


class ProductResponse(BaseModel):
    product_id: int
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    price: float
    stock_quantity: int
    is_available: bool
    tenant_id: int

    model_config = ConfigDict(from_attributes=True)


class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    page: int
    page_size: int
    total: int


ProductRead = ProductResponse
