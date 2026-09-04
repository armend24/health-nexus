from pydantic import BaseModel, ConfigDict
from datetime import datetime


class RoleBase(BaseModel):
    name: str


class RoleCreate(RoleBase):
    pass


class RoleUpdate(BaseModel):
    name: str | None = None


class RoleRead(RoleBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
