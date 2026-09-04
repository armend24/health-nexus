from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from typing import Dict, Any

from app.auth.auth_utils import get_current_user
from app.db import SessionLocal
from app.schemas.enrollment import EnrollmentStatusRead
from app.services.enrollment_service import (
    ActorContext,
    EnrollmentServiceError,
    list_my_enrollments_global,
)
from app.models.enrollment import EnrollmentStatus
from fastapi.responses import JSONResponse

router = APIRouter(
    prefix="/enrollments",
    tags=["Enrollments"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _actor_from_user_payload(payload: Dict[str, Any]) -> ActorContext:
    return ActorContext(
        user_id=payload.get("user_id"),
        role=str(payload.get("role") or ""),
    )


def _error_response(exc: EnrollmentServiceError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.http_status,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )


@router.get("/me", response_model=list[EnrollmentStatusRead])
def list_my_enrollments(
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    actor = _actor_from_user_payload(user)

    try:
        enrollments = list_my_enrollments_global(
            db,
            actor=actor,
        )

        return [
            EnrollmentStatusRead(
                id=e.id,
                patient_user_id=e.patient_user_id,
                tenant_id=e.tenant_id,
                user_tenant_plan_id=e.user_tenant_plan_id,
                status=e.status.value if isinstance(e.status, EnrollmentStatus) else str(e.status),
                activated_at=e.activated_at.isoformat() if e.activated_at else None,
                cancelled_at=e.cancelled_at.isoformat() if e.cancelled_at else None,
                expires_at=e.expires_at.isoformat() if e.expires_at else None,
                updated_at=e.updated_at.isoformat() if e.updated_at else None,
            )
            for e in enrollments
        ]

    except EnrollmentServiceError as exc:
        return _error_response(exc)
