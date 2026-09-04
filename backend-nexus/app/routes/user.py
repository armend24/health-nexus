"""Users (e.g. list doctors for assign-doctor dropdown)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user, hash_password
from app.db import get_db
from app.models.user import User
from app.models.role import Role
from app.models.doctor import Doctor
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


class DoctorAssignableRead(BaseModel):
    """User with DOCTOR role for assign-doctor dropdown."""

    id: int
    first_name: str | None
    last_name: str | None
    email: str
    assigned_tenant_id: int | None

    class Config:
        from_attributes = True


def _get_current_user_id_or_401(current_user: dict) -> int:
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    try:
        return int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


@router.get("/me", response_model=UserRead)
def get_me(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = _get_current_user_id_or_401(current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/me", response_model=UserRead)
def patch_me(
    payload: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = _get_current_user_id_or_401(current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    data = payload.model_dump(exclude_unset=True)
    if "role_id" in data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Updating role is not allowed for this endpoint",
        )

    password = data.pop("password", None)
    if password is not None:
        user.password = hash_password(password)
    for field, value in data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


@router.get("/doctors", response_model=list[DoctorAssignableRead])
def list_doctors_for_assign(
    exclude_tenant_id: int | None = Query(
        default=None, description="Exclude doctors already assigned to this tenant"
    ),
    db: Session = Depends(get_db),
):
    doctor_role = db.query(Role).filter(Role.name == "DOCTOR").first()
    if not doctor_role:
        return []
    users = (
        db.query(User)
        .filter(User.role_id == doctor_role.id)
        .order_by(User.first_name, User.last_name)
        .all()
    )
    doctors_by_user = {
        d.user_id: d for d in db.query(Doctor).filter(Doctor.user_id.in_(u.id for u in users)).all()
    }
    result = []
    for user in users:
        doc = doctors_by_user.get(user.id)
        tid = doc.tenant_id if doc else None
        if exclude_tenant_id is not None and tid == exclude_tenant_id:
            continue
        result.append(
            DoctorAssignableRead(
                id=user.id,
                first_name=user.first_name,
                last_name=user.last_name,
                email=user.email,
                assigned_tenant_id=tid,
            )
        )
    return result
