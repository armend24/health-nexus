from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ServiceBase(BaseModel):
    name: str
    price: float
    description: Optional[str] = None
    tenant_departments_id: int
    tenant_id: int
    is_active: bool = True


class ServiceCreateInput(BaseModel):
    """Create service under a tenant department. tenant_id is inferred from tenant_department."""

    tenant_department_id: int
    name: str
    price: float
    description: Optional[str] = None


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ServiceRead(ServiceBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
