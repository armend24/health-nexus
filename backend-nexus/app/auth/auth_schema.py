import re
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


# --- Signup ---

# Password rules: min length 8, at least one letter and one number
_PASSWORD_MIN_LEN = 8
_PASSWORD_LETTER_PATTERN = re.compile(r"[a-zA-Z]")
_PASSWORD_DIGIT_PATTERN = re.compile(r"\d")


def _validate_password_strength(value: str) -> str:
    if len(value) < _PASSWORD_MIN_LEN:
        raise ValueError(f"Password must be at least {_PASSWORD_MIN_LEN} characters")
    if not _PASSWORD_LETTER_PATTERN.search(value):
        raise ValueError("Password must contain at least one letter")
    if not _PASSWORD_DIGIT_PATTERN.search(value):
        raise ValueError("Password must contain at least one number")
    return value


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    role: str = "client"

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class SignupResponse(BaseModel):
    user_id: int
    email: str
    role: str
