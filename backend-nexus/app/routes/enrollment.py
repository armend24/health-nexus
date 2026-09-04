from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user
from app.db import SessionLocal
from app.models.enrollment import Enrollment

from app.schemas.enrollment import (
    EnrollmentCreateRequest,
    EnrollmentStatusRead,
    EnrollmentOperationalStatus,
)
from app.schemas.enrollment_status_history import EnrollmentStatusHistoryRead
from app.services.enrollment_service import (
    ActorContext,
    EnrollmentErrorCode,
    EnrollmentServiceError,
    create_enrollment,
    transition_enrollment,
    get_enrollment_scoped,
    list_enrollments_scoped,
    get_operational_status,
    get_enrollment_history_scoped,
)
from app.models.enrollment import EnrollmentStatus

router = APIRouter(
    prefix="/tenants/{tenant_id}/enrollments",
    tags=["Enrollments"],
)


def get_db():
    """
    Provide a transactional SQLAlchemy session for the request lifecycle.

    Yields:
        An active SQLAlchemy Session instance.

    Ensures:
        The session is properly closed after request processing.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _actor_from_user_payload(payload: Dict[str, Any]) -> ActorContext:
    """
    Build an ActorContext from the authenticated user payload.

    Args:
        payload: Decoded JWT payload containing user identity and role.

    Returns:
        An ActorContext instance used by the service layer for
        authorization and auditing decisions.
    """
    user_id = payload.get("user_id")
    role = payload.get("role") or ""
    return ActorContext(user_id=user_id, role=str(role))


def _ensure_tenant_context_consistency(
    *,
    requested_tenant_id: int,
    user_payload: Dict[str, Any],
    request: Request,
) -> None:
    """
    Ensure request tenant context is consistent across token/header/request payload.
    """
    token_tenant_raw = user_payload.get("tenant_id")
    if token_tenant_raw is not None:
        try:
            token_tenant_id = int(token_tenant_raw)
        except (TypeError, ValueError):
            raise EnrollmentServiceError(
                EnrollmentErrorCode.UNAUTHORIZED,
                "Invalid tenant context in authentication token",
                http_status=403,
            )

        if token_tenant_id != requested_tenant_id:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
                "Token tenant does not match requested tenant",
                http_status=403,
                details={
                    "token_tenant_id": token_tenant_id,
                    "requested_tenant_id": requested_tenant_id,
                },
            )

    header_tenant_raw = request.headers.get("X-Tenant-Id")
    if header_tenant_raw is None or header_tenant_raw.strip() == "":
        return

    try:
        header_tenant_id = int(header_tenant_raw)
    except ValueError:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.VALIDATION_ERROR,
            "X-Tenant-Id must be a valid integer",
            http_status=400,
        )

    if header_tenant_id != requested_tenant_id:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
            "Header tenant does not match requested tenant",
            http_status=403,
            details={
                "header_tenant_id": header_tenant_id,
                "requested_tenant_id": requested_tenant_id,
            },
        )


def _error_response(exc: EnrollmentServiceError) -> JSONResponse:
    """
    Convert a service-layer exception into a standardized JSON error response.

    Args:
        exc: EnrollmentServiceError raised by the service layer.

    Returns:
        JSONResponse formatted according to the application's
        error contract.
    """
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


@router.post("", response_model=EnrollmentStatusRead, status_code=201)
def create_enrollment_endpoint(
    tenant_id: int,
    payload: EnrollmentCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Create a new enrollment record.

    Args:
        tenant_id: Tenant identifier from the route.
        payload: EnrollmentCreateRequest containing patient and plan identifiers.
        db: Active SQLAlchemy session.
        user: Authenticated user payload provided by dependency injection.

    Returns:
        EnrollmentStatusRead representing the created enrollment.

    Raises:
        Returns a structured JSON error if the service layer
        raises EnrollmentServiceError.
    """
    actor = _actor_from_user_payload(user)
    try:
        _ensure_tenant_context_consistency(
            requested_tenant_id=tenant_id,
            user_payload=user,
            request=request,
        )
        enrollment = create_enrollment(
            db,
            tenant_id=tenant_id,
            patient_user_id=payload.patient_user_id,
            user_tenant_plan_id=payload.user_tenant_plan_id,
            actor=actor,
        )

        return EnrollmentStatusRead(
            id=enrollment.id,
            patient_user_id=enrollment.patient_user_id,
            user_tenant_plan_id=enrollment.user_tenant_plan_id,
            tenant_id=enrollment.tenant_id,
            status=(
                enrollment.status.value
                if isinstance(enrollment.status, EnrollmentStatus)
                else str(enrollment.status)
            ),
            activated_at=enrollment.activated_at.isoformat() if enrollment.activated_at else None,
            cancelled_at=enrollment.cancelled_at.isoformat() if enrollment.cancelled_at else None,
            expires_at=enrollment.expires_at.isoformat() if enrollment.expires_at else None,
            updated_at=(
                enrollment.updated_at.isoformat()
                if hasattr(enrollment, "updated_at") and enrollment.updated_at
                else None
            ),
        )
    except EnrollmentServiceError as exc:
        return _error_response(exc)


@router.get(
    "/history",
    response_model=list[EnrollmentStatusHistoryRead],
)
def enrollment_history_endpoint(
    tenant_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Retrieve the full enrollment status history for a tenant.
    Returns every history record associated with any enrollment
    that belongs to the given tenant.
    """
    actor = _actor_from_user_payload(user)

    try:
        _ensure_tenant_context_consistency(
            requested_tenant_id=tenant_id,
            user_payload=user,
            request=request,
        )

        history = get_enrollment_history_scoped(
            db,
            actor=actor,
            expected_tenant_id=tenant_id,
        )

        return history  # Pydantic handles conversion (from_attributes=True)

    except EnrollmentServiceError as exc:
        return _error_response(exc)


@router.get("/{enrollment_id}", response_model=EnrollmentStatusRead)
def get_enrollment_endpoint(
    tenant_id: int,
    enrollment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Retrieve a single enrollment by its identifier.

    Args:
        tenant_id: Tenant identifier from the route.
        enrollment_id: Primary key of the enrollment.
        db: Active SQLAlchemy session.
        user: Authenticated user payload.

    Returns:
        EnrollmentStatusRead for the requested enrollment.

    Raises:
        Returns a structured JSON error if access is denied
        or the enrollment is not found.
    """
    actor = _actor_from_user_payload(user)
    try:
        _ensure_tenant_context_consistency(
            requested_tenant_id=tenant_id,
            user_payload=user,
            request=request,
        )
        enrollment = get_enrollment_scoped(
            db,
            enrollment_id=enrollment_id,
            actor=actor,
            expected_tenant_id=tenant_id,
        )

        return EnrollmentStatusRead(
            id=enrollment.id,
            patient_user_id=enrollment.patient_user_id,
            user_tenant_plan_id=enrollment.user_tenant_plan_id,
            tenant_id=enrollment.tenant_id,
            status=(
                enrollment.status.value
                if isinstance(enrollment.status, EnrollmentStatus)
                else str(enrollment.status)
            ),
            activated_at=enrollment.activated_at.isoformat() if enrollment.activated_at else None,
            cancelled_at=enrollment.cancelled_at.isoformat() if enrollment.cancelled_at else None,
            expires_at=enrollment.expires_at.isoformat() if enrollment.expires_at else None,
            updated_at=(
                enrollment.updated_at.isoformat()
                if hasattr(enrollment, "updated_at") and enrollment.updated_at
                else None
            ),
        )
    except EnrollmentServiceError as exc:
        return _error_response(exc)


@router.get("", response_model=list[EnrollmentStatusRead])
def list_enrollments_endpoint(
    tenant_id: int,
    request: Request,
    patient_user_id: Optional[int] = Query(default=None),
    status: Optional[EnrollmentStatus] = Query(default=None),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    List enrollments scoped to a tenant, optionally filtered by patient.

    Args:
        tenant_id: Identifier of the tenant whose enrollments are requested.
        patient_user_id: Optional patient user identifier for additional filtering.
        db: Active SQLAlchemy session.
        user: Authenticated user payload.

    Returns:
        A list of EnrollmentStatusRead objects visible to the caller.

    Raises:
        Returns a structured JSON error if authorization fails.
    """
    actor = _actor_from_user_payload(user)
    try:
        _ensure_tenant_context_consistency(
            requested_tenant_id=tenant_id,
            user_payload=user,
            request=request,
        )
        enrollments = list_enrollments_scoped(
            db,
            tenant_id=tenant_id,
            actor=actor,
            patient_user_id=patient_user_id,
            status=status,
        )

        return [
            EnrollmentStatusRead(
                id=e.id,
                status=e.status.value if isinstance(e.status, EnrollmentStatus) else str(e.status),
                patient_user_id=e.patient_user_id,
                user_tenant_plan_id=e.user_tenant_plan_id,
                tenant_id=e.tenant_id,
                activated_at=e.activated_at.isoformat() if e.activated_at else None,
                cancelled_at=e.cancelled_at.isoformat() if e.cancelled_at else None,
                expires_at=e.expires_at.isoformat() if e.expires_at else None,
                updated_at=(
                    e.updated_at.isoformat() if hasattr(e, "updated_at") and e.updated_at else None
                ),
            )
            for e in enrollments
        ]
    except EnrollmentServiceError as exc:
        return _error_response(exc)


@router.post("/{enrollment_id}/transition", response_model=EnrollmentStatusRead)
def transition_enrollment_endpoint(
    tenant_id: int,
    enrollment_id: int,
    body: Dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Transition an enrollment to a new status.

    Args:
        tenant_id: Tenant identifier from the route.
        enrollment_id: Identifier of the enrollment to transition.
        body: Request body containing 'target_status' and optional 'reason'.
        db: Active SQLAlchemy session.
        user: Authenticated user payload.

    Returns:
        EnrollmentStatusRead reflecting the updated enrollment state.

    Raises:
        Returns a validation error if target_status is missing or invalid.
        Returns a structured JSON error for service-level failures.
    """
    actor = _actor_from_user_payload(user)
    try:
        _ensure_tenant_context_consistency(
            requested_tenant_id=tenant_id,
            user_payload=user,
            request=request,
        )
    except EnrollmentServiceError as exc:
        return _error_response(exc)

    target_status_value = body.get("target_status")
    reason = body.get("reason")

    if target_status_value is None:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "target_status is required",
                    "details": {},
                }
            },
        )

    try:
        EnrollmentStatus(target_status_value)
    except ValueError:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid target_status value",
                    "details": {"target_status": target_status_value},
                }
            },
        )

    try:
        enrollment = transition_enrollment(
            db,
            enrollment_id=enrollment_id,
            target_status=target_status_value,
            actor=actor,
            expected_tenant_id=tenant_id,
            reason=reason,
            system=False,
        )

        return EnrollmentStatusRead(
            id=enrollment.id,
            patient_user_id=enrollment.patient_user_id,
            user_tenant_plan_id=enrollment.user_tenant_plan_id,
            tenant_id=enrollment.tenant_id,
            status=(
                enrollment.status.value
                if isinstance(enrollment.status, EnrollmentStatus)
                else str(enrollment.status)
            ),
            activated_at=enrollment.activated_at.isoformat() if enrollment.activated_at else None,
            cancelled_at=enrollment.cancelled_at.isoformat() if enrollment.cancelled_at else None,
            expires_at=enrollment.expires_at.isoformat() if enrollment.expires_at else None,
            updated_at=(
                enrollment.updated_at.isoformat()
                if hasattr(enrollment, "updated_at") and enrollment.updated_at
                else None
            ),
        )
    except EnrollmentServiceError as exc:
        return _error_response(exc)


# @router.get(
#    "/me/enrollments",
#    response_model=list[EnrollmentStatusRead],
# )
# def list_my_enrollments(
#    db: Session = Depends(get_db),
#    user: Dict[str, Any] = Depends(get_current_user),
# ):
#    """List all enrollments for the authenticated patient user."""
#    patient_user_id = user["user_id"]

#    enrollments = (
#        db.query(Enrollment)
#        .filter(Enrollment.patient_user_id == patient_user_id)
#        .all()
#    )

#    return [
#        EnrollmentStatusRead(
#            id=e.id,
#            patient_user_id=e.patient_user_id,
#            status=e.status.value,
#            activated_at=e.activated_at.isoformat() if e.activated_at else None,
#            cancelled_at=e.cancelled_at.isoformat() if e.cancelled_at else None,
#            expires_at=e.expires_at.isoformat() if e.expires_at else None,
#            updated_at=e.updated_at.isoformat() if e.updated_at else None,
#        )
#        for e in enrollments
#    ]
##@router.get(
##    "/me/enrollments",
##    response_model=list[EnrollmentStatusRead],
##)
##def list_my_enrollments(
##    tenant_id: int,
##    request: Request,
##    db: Session = Depends(get_db),
##    user: Dict[str, Any] = Depends(get_current_user),
##):
##    """
##    List all enrollments for the authenticated patient user
##    within the specified tenant.
##    """
##    actor = _actor_from_user_payload(user)

##    try:
##        _ensure_tenant_context_consistency(
##            requested_tenant_id=tenant_id,
##            user_payload=user,
##            request=request,
##        )

##        enrollments = list_my_enrollments_scoped(
##            db,
##            actor=actor,
##            expected_tenant_id=tenant_id,
##        )

##        return [
##            EnrollmentStatusRead(
##                id=e.id,
##                patient_user_id=e.patient_user_id,
##                status=e.status.value,
##                activated_at=e.activated_at.isoformat()
##                if e.activated_at
##                else None,
##                cancelled_at=e.cancelled_at.isoformat()
##                if e.cancelled_at
##                else None,
##                expires_at=e.expires_at.isoformat()
##                if e.expires_at
##                else None,
##                updated_at=e.updated_at.isoformat()
##                if hasattr(e, "updated_at") and e.updated_at
##                else None,
##            )
##            for e in enrollments
##        ]

##    except EnrollmentServiceError as exc:
##        return _error_response(exc)


@router.get("/{enrollment_id}/status", response_model=EnrollmentOperationalStatus)
def enrollment_operational_status_endpoint(
    tenant_id: int,
    enrollment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Retrieve the operational status of an enrollment.

    Args:
        tenant_id: Tenant identifier from the route.
        enrollment_id: Identifier of the enrollment.
        db: Active SQLAlchemy session.
        user: Authenticated user payload.

    Returns:
        EnrollmentOperationalStatus describing the current
        operational state of the enrollment.

    Raises:
        Returns a structured JSON error if access is denied
        or the enrollment does not exist.
    """
    actor = _actor_from_user_payload(user)
    try:
        _ensure_tenant_context_consistency(
            requested_tenant_id=tenant_id,
            user_payload=user,
            request=request,
        )
        status_payload = get_operational_status(
            db,
            enrollment_id=enrollment_id,
            actor=actor,
            expected_tenant_id=tenant_id,
        )
        return EnrollmentOperationalStatus(**status_payload)
    except EnrollmentServiceError as exc:
        return _error_response(exc)
