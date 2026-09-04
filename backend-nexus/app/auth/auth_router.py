from typing import Annotated

from fastapi import APIRouter, Body, Depends

from app.auth.auth_schema import (
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    SignupResponse,
    TokenResponse,
)
from app.auth.auth_service import login_user, logout_user, refresh_access_token, signup_user
from app.auth.auth_utils import require_permission, require_role

# Router for authentication endpoints
router = APIRouter(prefix="/auth", tags=["Auth"])


# Signup endpoint - creates a global user account
@router.post("/signup", response_model=SignupResponse, status_code=201)
def signup(body: SignupRequest) -> SignupResponse:
    return signup_user(body)


# Login endpoint - returns JWT token
@router.post("/login", response_model=TokenResponse)
def login(
    body: Annotated[
        LoginRequest,
        Body(
            examples=[
                {
                    "email": "super.admin@seed.com",
                    "password": "Team2026@",
                }
            ],
        ),
    ],
) -> TokenResponse:
    return login_user(body.email, body.password)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest) -> TokenResponse:
    return refresh_access_token(body.refresh_token)


@router.post("/logout")
def logout(body: RefreshRequest) -> dict:
    logout_user(body.refresh_token)
    return {"message": "Logged out successfully"}


@router.get("/me")
def get_me(user=Depends(require_permission("auth:me"))):
    return {"message": "You are authenticated", "user": user}


# Protected admin route using RBAC (SUPER_ADMIN only)
@router.get("/admin")
def get_admin(user=Depends(require_role("SUPER_ADMIN"))):
    return {"message": "Welcome, admin!"}
