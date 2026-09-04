from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime
from app.models.tenant import TenantStatus


class TenantBase(BaseModel):
    name: str
    email: EmailStr
    licence_number: str


class TenantCreate(TenantBase):
    pass


class TenantUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    licence_number: str | None = None


class TenantRead(TenantBase):
    id: int
    status: TenantStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TenantStatusUpdate(BaseModel):
    status: TenantStatus
    reason: str | None = None


class TenantListResponse(BaseModel):
    items: list[TenantRead]
    total: int
    page: int
    page_size: int


# # For future pagination support
# class TenantListResponse(BaseModel):
#     items: list[TenantRead]
#     total: int
#     page: int
#     page_size: int
