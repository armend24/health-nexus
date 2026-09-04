"""Schemas for the tenant landing page API - single response with all data."""

from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class TenantPublicCard(BaseModel):
    """Minimal tenant info for public listing (active tenants only)."""

    id: int
    slug: Optional[str] = None
    name: str
    moto: Optional[str] = None
    about_text: Optional[str] = None
    logo: Optional[str] = None
    image: Optional[str] = None
    brand_color_primary: Optional[str] = None
    brand_color_secondary: Optional[str] = None
    brand_color_background: Optional[str] = None
    brand_color_foreground: Optional[str] = None
    brand_color_muted: Optional[str] = None

    class Config:
        from_attributes = True


class ServiceLandingItem(BaseModel):
    id: int
    name: str
    price: float
    description: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class DepartmentLandingItem(BaseModel):
    id: int
    name: str
    phone_number: Optional[str] = None
    email: Optional[str] = None
    location: Optional[str] = None
    services: list[ServiceLandingItem] = []

    class Config:
        from_attributes = True


class DoctorLandingItem(BaseModel):
    user_id: int
    first_name: str
    last_name: str
    specialization: Optional[str] = None
    education: Optional[str] = None
    licence_number: Optional[str] = None
    is_active: bool = True
    working_hours: Optional[dict] = None

    class Config:
        from_attributes = True


class ProductLandingItem(BaseModel):
    product_id: int
    tenant_id: int
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    price: float
    stock_quantity: int = 0
    is_available: bool = True

    class Config:
        from_attributes = True


class TenantLandingRead(BaseModel):
    id: int
    name: str
    slug: Optional[str] = None
    email: str
    licence_number: str

    class Config:
        from_attributes = True


class TenantDetailsLandingRead(BaseModel):
    tenant_id: int
    logo: Optional[str] = None
    image: Optional[str] = None
    moto: Optional[str] = None
    brand_color_primary: Optional[str] = None
    brand_color_secondary: Optional[str] = None
    brand_color_background: Optional[str] = None
    brand_color_foreground: Optional[str] = None
    brand_color_muted: Optional[str] = None
    title: Optional[str] = None
    about_text: Optional[str] = None
    font_id: Optional[int] = None
    font_name: Optional[str] = None
    font_header_family: Optional[str] = None
    font_body_family: Optional[str] = None

    class Config:
        from_attributes = True


class PlanLandingItem(BaseModel):
    """Active plan shown on the public tenant landing page."""

    id: int
    name: str
    description: Optional[str] = None
    price: float
    duration: Optional[int] = None
    max_appointments: Optional[int] = None
    max_consultations: Optional[int] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class TenantLandingPageResponse(BaseModel):
    tenant: TenantLandingRead
    details: Optional[TenantDetailsLandingRead] = None
    departments: list[DepartmentLandingItem] = []
    doctors: list[DoctorLandingItem] = []
    products: list[ProductLandingItem] = []
    plans: list[PlanLandingItem] = []
