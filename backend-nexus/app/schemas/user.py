from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    first_name: Optional[str]
    last_name: Optional[str]
    email: EmailStr
    contact: Optional[str]
    address: Optional[str]
    role_id: Optional[int]


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None
    role: str


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None
    role_id: Optional[int] = None
    password: Optional[str] = None


class UserRead(UserBase):
    id: int
    created_at: datetime
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)
