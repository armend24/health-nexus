from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TenantDetailsBase(BaseModel):
    logo: Optional[str] = None
    image: Optional[str] = None
    moto: Optional[str] = None
    brand_id: Optional[int] = None
    title: Optional[str] = None
    about_text: Optional[str] = None


class TenantDetailsUpdate(BaseModel):
    """All optional for partial updates."""

    logo: Optional[str] = None
    image: Optional[str] = None
    moto: Optional[str] = None
    brand_id: Optional[int] = None
    font_id: Optional[int] = None
    title: Optional[str] = None
    about_text: Optional[str] = None


class TenantDetailsRead(TenantDetailsBase):
    tenant_id: int
    font_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
