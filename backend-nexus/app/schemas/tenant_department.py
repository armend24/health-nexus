from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.schemas.landing import ServiceLandingItem


class TenantDepartmentBase(BaseModel):
    tenant_id: int
    department_id: int
    phone_number: Optional[str] = None
    email: Optional[str] = None
    location: Optional[str] = None


class TenantDepartmentCreate(TenantDepartmentBase):
    pass


class AddTenantDepartmentRequest(BaseModel):
    department_id: int
    phone_number: Optional[str] = None
    email: Optional[str] = None
    location: Optional[str] = None


class UpdateTenantDepartmentRequest(BaseModel):
    phone_number: Optional[str] = None
    email: Optional[str] = None
    location: Optional[str] = None


class BulkDepartmentItem(BaseModel):
    """Department assignment with optional contact info. Services are managed via /api/services."""

    department_id: int
    phone_number: Optional[str] = None
    email: Optional[str] = None
    location: Optional[str] = None


class BulkDepartmentsRequest(BaseModel):
    """Bulk set departments for a tenant. Replaces existing with this list."""

    items: list[BulkDepartmentItem]


class TenantDepartmentRead(TenantDepartmentBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class TenantDepartmentWithServicesRead(TenantDepartmentRead):
    """Tenant department with department name and services."""

    department_name: str
    services: list[ServiceLandingItem] = []
