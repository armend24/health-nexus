from pydantic import BaseModel, ConfigDict


class TenantManagerBase(BaseModel):
    user_id: int
    tenant_id: int


class TenantManagerCreate(TenantManagerBase):
    pass


class TenantManagerRead(TenantManagerBase):
    model_config = ConfigDict(from_attributes=True)
