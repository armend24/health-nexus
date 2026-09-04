from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user
from app.db import get_db
from app.models.patient import Patient
from app.models.tenant import Tenant
from app.schemas.patient_schema import MyTenantSummaryResponse

router = APIRouter(prefix="/patients", tags=["Patients"])


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


@router.get("/me/tenants", response_model=list[MyTenantSummaryResponse])
def list_my_tenants(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = _get_current_user_id_or_401(current_user)
    rows = (
        db.query(Tenant.id, Tenant.name, Tenant.status)
        .join(Patient, Patient.tenant_id == Tenant.id)
        .filter(Patient.user_id == user_id)
        .order_by(Tenant.name)
        .all()
    )
    return [
        MyTenantSummaryResponse(
            tenant_id=row.id,
            name=row.name,
            status=row.status,
        )
        for row in rows
    ]
