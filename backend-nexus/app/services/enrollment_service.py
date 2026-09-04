from __future__ import annotations

import enum
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.enrollment_status_history import EnrollmentStatusHistory
from app.models.audit_event import AuditEvent
from app.models import TenantManager, Doctor
from app.repositories import (
    get_tenant,
    get_patient_by_tenant_and_user,
    get_patient_by_user,
    get_user_tenant_plan,
    get_enrollment_by_id,
    get_enrollment_by_tenant_and_patient,
    list_enrollments_by_tenant,
    list_enrollment_status_history,
)

# ============================================================================
# Error Model
# ============================================================================


class EnrollmentErrorCode(str, enum.Enum):
    """
    Enumeration of domain-level error codes used by the enrollment service.

    These codes are stable identifiers that controllers can rely on
    to map service-layer failures into consistent HTTP responses and
    structured error payloads.
    """

    INVALID_TRANSITION = "INVALID_TRANSITION"
    UNAUTHORIZED = "UNAUTHORIZED"
    TENANT_SCOPE_VIOLATION = "TENANT_SCOPE_VIOLATION"
    NOT_FOUND = "NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    CONFLICT = "CONFLICT"


class EnrollmentServiceError(Exception):
    """
    Domain-specific exception raised by the enrollment service layer.

    Controllers are expected to catch this exception and convert it
    into the appropriate HTTP response format. The service layer does
    not return HTTP responses directly; instead, it raises structured
    errors containing:

    - code: a stable, machine-readable error code
    - message: a human-readable explanation
    - http_status: the intended HTTP status code
    - details: optional structured context for debugging or clients
    """

    def __init__(
        self,
        code: EnrollmentErrorCode,
        message: str,
        http_status: int,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code.value
        self.message = message
        self.http_status = http_status
        self.details: Dict[str, Any] = details or {}


# ============================================================================
# Actor Context & Role Definitions
# ============================================================================


@dataclass
class ActorContext:
    """
    Lightweight representation of the authenticated actor performing
    an operation.

    This is typically constructed from the JWT payload at the route layer
    and passed into service functions to enforce authorization rules.
    """

    user_id: Optional[int]
    role: str


# Canonical role constants used for normalization and comparison.
ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_TENANT_MANAGER = "TENANT_MANAGER"
ROLE_DOCTOR = "DOCTOR"
ROLE_PATIENT = "PATIENT"
ROLE_SALES_AGENT = "SALES_AGENT"


def _normalize_role(role: str | None) -> str:
    """
    Normalize a role string for consistent comparison.

    Converts None to an empty string and ensures uppercasing and trimming.
    This avoids subtle authorization bugs caused by casing or whitespace.
    """
    if not role:
        return ""
    return role.strip().upper()


def _is_super_admin(actor: ActorContext) -> bool:
    """
    Determine whether the actor has SUPER_ADMIN privileges.
    """
    return _normalize_role(actor.role) == ROLE_SUPER_ADMIN


# ============================================================================
# Authorization Helpers
# ============================================================================


def _ensure_actor_can_mutate_tenant(
    db: Session,
    actor: ActorContext,
    tenant_id: int,
) -> None:
    """
    Enforce write-level (mutation) authorization for a tenant.

    Rules:
    - SUPER_ADMIN: always allowed.
    - TENANT_MANAGER: must have a TenantManager row for (user_id, tenant_id).
    - All other roles: forbidden.

    Raises:
        EnrollmentServiceError if authorization fails.
    """
    role = _normalize_role(actor.role)

    if _is_super_admin(actor):
        return

    if role != ROLE_TENANT_MANAGER:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.UNAUTHORIZED,
            "Actor is not allowed to modify enrollments",
            http_status=403,
            details={"role": role},
        )

    if actor.user_id is None:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.UNAUTHORIZED,
            "Missing actor user_id for tenant-scoped operation",
            http_status=403,
        )

    manager = (
        db.query(TenantManager)
        .filter(
            TenantManager.user_id == actor.user_id,
            TenantManager.tenant_id == tenant_id,
        )
        .first()
    )
    if manager is None:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
            "Actor does not manage the target tenant",
            http_status=403,
            details={"tenant_id": tenant_id},
        )


def _ensure_actor_can_create_enrollment(
    db: Session,
    actor: ActorContext,
    *,
    tenant_id: int,
    patient_user_id: int,
) -> None:
    """
    Enforce create-level authorization for enrollments.

    Rules:
    - SUPER_ADMIN: always allowed.
    - TENANT_MANAGER: must manage the target tenant.
    - PATIENT: may create enrollment only for self.
    - Others: forbidden.
    """
    role = _normalize_role(actor.role)

    if _is_super_admin(actor):
        return

    if role == ROLE_TENANT_MANAGER:
        _ensure_actor_can_mutate_tenant(db, actor, tenant_id)
        return
    # changed this part of the code to allow patients to create enrollments for themselves.
    if role == ROLE_PATIENT:
        if actor.user_id is None:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.UNAUTHORIZED,
                "Missing actor user_id for enrollment creation",
                http_status=403,
            )
        if actor.user_id != patient_user_id:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
                "Client can only create enrollment for self",
                http_status=403,
                details={
                    "actor_user_id": actor.user_id,
                    "patient_user_id": patient_user_id,
                },
            )
        return

    raise EnrollmentServiceError(
        EnrollmentErrorCode.UNAUTHORIZED,
        "Actor is not allowed to create enrollments",
        http_status=403,
        details={"role": role},
    )


def _ensure_actor_can_view_enrollment(
    db: Session,
    actor: ActorContext,
    enrollment: Enrollment,
) -> None:
    """
    Enforce read-level authorization for a specific enrollment.

    Access rules:
    - SUPER_ADMIN: full access.
    - TENANT_MANAGER: must manage the enrollment's tenant.
    - PATIENT: may only view own enrollment.
    - DOCTOR: may view enrollments within their tenant.
    - Others: unauthorized.
    """
    role = _normalize_role(actor.role)

    if _is_super_admin(actor):
        return

    if role == ROLE_TENANT_MANAGER:
        if actor.user_id is None:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.UNAUTHORIZED,
                "Missing actor user_id for tenant-scoped operation",
                http_status=403,
            )
        manager = (
            db.query(TenantManager)
            .filter(
                TenantManager.user_id == actor.user_id,
                TenantManager.tenant_id == enrollment.tenant_id,
            )
            .first()
        )
        if manager is None:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
                "Actor does not have access to this tenant",
                http_status=403,
                details={"tenant_id": enrollment.tenant_id},
            )
        return

    if role == ROLE_PATIENT and actor.user_id is not None:
        if enrollment.patient_user_id == actor.user_id:
            return

    if role == ROLE_DOCTOR and actor.user_id is not None:
        doctor = db.query(Doctor).filter(Doctor.user_id == actor.user_id).first()
        if doctor and doctor.tenant_id == enrollment.tenant_id:
            return

    raise EnrollmentServiceError(
        EnrollmentErrorCode.UNAUTHORIZED,
        "Actor is not allowed to view this enrollment",
        http_status=403,
    )


# ============================================================================
# Serialization
# ============================================================================


def _serialize_enrollment(enrollment: Enrollment) -> Dict[str, Any]:
    """
    Produce a JSON-serializable snapshot of an enrollment.

    This snapshot is used for audit logging (old_value/new_value)
    to guarantee traceability of changes across status transitions
    and lifecycle events.
    """
    return {
        "id": enrollment.id,
        "tenant_id": enrollment.tenant_id,
        "patient_user_id": enrollment.patient_user_id,
        "user_tenant_plan_id": enrollment.user_tenant_plan_id,
        "created_by": enrollment.created_by,
        "status": (
            enrollment.status.value
            if isinstance(enrollment.status, EnrollmentStatus)
            else str(enrollment.status)
        ),
        "activated_at": enrollment.activated_at.isoformat() if enrollment.activated_at else None,
        "cancelled_at": enrollment.cancelled_at.isoformat() if enrollment.cancelled_at else None,
        "expires_at": enrollment.expires_at.isoformat() if enrollment.expires_at else None,
    }


# ============================================================================
# Enrollment Creation
# ============================================================================


def _get_constraint_name(exc: IntegrityError) -> Optional[str]:
    """
    Extract DB constraint name from an IntegrityError when available.
    """
    diag = getattr(getattr(exc, "orig", None), "diag", None)
    name = getattr(diag, "constraint_name", None)
    if not name:
        return None
    return str(name)


def _map_create_integrity_error(
    exc: IntegrityError,
    *,
    tenant_id: int,
    patient_user_id: int,
) -> EnrollmentServiceError:
    """
    Convert low-level integrity failures into deterministic domain errors.
    """
    constraint_name = (_get_constraint_name(exc) or "").lower()
    raw_message = str(getattr(exc, "orig", exc)).lower()

    is_duplicate = (
        "uq_enrollment_patient_tenant" in constraint_name or "unique constraint" in raw_message
    )
    if is_duplicate:
        return EnrollmentServiceError(
            EnrollmentErrorCode.CONFLICT,
            "Enrollment already exists for this tenant and patient",
            http_status=409,
            details={
                "tenant_id": tenant_id,
                "patient_user_id": patient_user_id,
            },
        )

    is_patient_tenant_fk = "fk_enrollments_patient_tenant_user" in constraint_name or (
        "foreign key" in raw_message and "patient" in raw_message
    )
    if is_patient_tenant_fk:
        return EnrollmentServiceError(
            EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
            "Patient does not belong to the specified tenant",
            http_status=403,
            details={
                "tenant_id": tenant_id,
                "patient_user_id": patient_user_id,
            },
        )

    return EnrollmentServiceError(
        EnrollmentErrorCode.CONFLICT,
        "Enrollment could not be created due to a data integrity violation",
        http_status=409,
        details={
            "tenant_id": tenant_id,
            "patient_user_id": patient_user_id,
        },
    )


def create_enrollment(
    db: Session,
    *,
    tenant_id: int,
    patient_user_id: int,
    user_tenant_plan_id: int,
    actor: ActorContext,
) -> Enrollment:
    """
    Create a new enrollment within a tenant.

    This function:
    - Enforces tenant-scoped authorization.
    - Validates tenant, patient, and plan consistency.
    - Prevents duplicate (tenant_id, patient_user_id) enrollments.
    - Creates initial PENDING status.
    - Writes both status history and audit log entries.
    - Commits atomically.
    """
    _ensure_actor_can_create_enrollment(
        db,
        actor,
        tenant_id=tenant_id,
        patient_user_id=patient_user_id,
    )

    tenant = get_tenant(db, tenant_id)
    if tenant is None:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.NOT_FOUND,
            "Tenant not found",
            http_status=404,
            details={"tenant_id": tenant_id},
        )

    patient = get_patient_by_tenant_and_user(
        db,
        tenant_id=tenant_id,
        patient_user_id=patient_user_id,
    )
    if patient is None:
        any_tenant_patient = get_patient_by_user(db, patient_user_id)
        if any_tenant_patient is None:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.VALIDATION_ERROR,
                "Patient not found",
                http_status=400,
                details={"patient_user_id": patient_user_id},
            )
        raise EnrollmentServiceError(
            EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
            "Patient does not belong to the specified tenant",
            http_status=403,
            details={
                "tenant_id": tenant_id,
                "patient_user_id": patient_user_id,
            },
        )

    plan = get_user_tenant_plan(db, user_tenant_plan_id)
    if plan is None:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.VALIDATION_ERROR,
            "User tenant plan not found",
            http_status=400,
            details={"user_tenant_plan_id": user_tenant_plan_id},
        )

    if plan.tenant_id != tenant_id:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.VALIDATION_ERROR,
            "User tenant plan does not belong to the specified tenant",
            http_status=400,
            details={"tenant_id": tenant_id, "user_tenant_plan_id": user_tenant_plan_id},
        )

    existing = get_enrollment_by_tenant_and_patient(db, tenant_id, patient_user_id)
    if existing is not None:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.CONFLICT,
            "Enrollment already exists for this tenant and patient",
            http_status=409,
            details={
                "tenant_id": tenant_id,
                "patient_user_id": patient_user_id,
                "enrollment_id": existing.id,
            },
        )

    if actor.user_id is None:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.UNAUTHORIZED,
            "Missing actor user_id for enrollment creation",
            http_status=403,
        )

    now = datetime.now(timezone.utc)

    enrollment = Enrollment(
        tenant_id=tenant_id,
        patient_user_id=patient_user_id,
        user_tenant_plan_id=user_tenant_plan_id,
        created_by=actor.user_id,
        status=EnrollmentStatus.PENDING,
        updated_at=now,
    )

    history = EnrollmentStatusHistory(
        enrollment=enrollment,
        tenant_id=tenant_id,
        old_status=EnrollmentStatus.PENDING,
        new_status=EnrollmentStatus.PENDING,
        changed_by=actor.user_id,
        changed_by_role=_normalize_role(actor.role),
        reason=None,
        changed_at=now,
    )

    audit = AuditEvent(
        tenant_id=tenant_id,
        entity_type="ENROLLMENT",
        entity_id=0,
        action="CREATED",
        old_value=None,
        new_value=None,
        actor_user_id=actor.user_id,
    )

    try:
        db.add(enrollment)
        db.flush()

        audit.entity_id = enrollment.id
        audit.new_value = _serialize_enrollment(enrollment)

        db.add(history)
        db.add(audit)

        db.commit()
        db.refresh(enrollment)
        return enrollment
    except EnrollmentServiceError:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise _map_create_integrity_error(
            exc,
            tenant_id=tenant_id,
            patient_user_id=patient_user_id,
        )


# ============================================================================
# Status Transitions
# ============================================================================


def transition_enrollment(
    db: Session,
    *,
    enrollment_id: int,
    target_status: EnrollmentStatus,
    actor: ActorContext,
    expected_tenant_id: Optional[int] = None,
    reason: Optional[str] = None,
    system: bool = False,
) -> Enrollment:
    """
    Perform a controlled status transition on an enrollment.

    This function centralizes:
    - Transition validation (allowed state graph).
    - Authorization enforcement (unless system-triggered).
    - Business rules per target status.
    - History and audit logging.
    - Atomic transaction handling.
    """
    enrollment = get_enrollment_by_id(db, enrollment_id)
    if enrollment is None:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.NOT_FOUND,
            "Enrollment not found",
            http_status=404,
            details={"enrollment_id": enrollment_id},
        )

    if expected_tenant_id is not None and enrollment.tenant_id != expected_tenant_id:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
            "Enrollment does not belong to the specified tenant",
            http_status=403,
            details={
                "enrollment_id": enrollment_id,
                "tenant_id": expected_tenant_id,
                "enrollment_tenant_id": enrollment.tenant_id,
            },
        )

    current_status = enrollment.status
    if isinstance(current_status, str):
        current_status = EnrollmentStatus(current_status)

    if isinstance(target_status, str):
        target_status = EnrollmentStatus(target_status)

    if current_status == target_status:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.INVALID_TRANSITION,
            "Enrollment is already in the requested status",
            http_status=400,
            details={
                "enrollment_id": enrollment_id,
                "status": current_status.value,
            },
        )

    allowed_transitions: dict[EnrollmentStatus, set[EnrollmentStatus]] = {
        EnrollmentStatus.PENDING: {
            EnrollmentStatus.ACTIVE,
            EnrollmentStatus.CANCELLED,
        },
        EnrollmentStatus.ACTIVE: {
            EnrollmentStatus.CANCELLED,
            EnrollmentStatus.EXPIRED,
        },
        EnrollmentStatus.CANCELLED: set(),
        EnrollmentStatus.EXPIRED: set(),
    }

    if target_status not in allowed_transitions.get(current_status, set()):
        raise EnrollmentServiceError(
            EnrollmentErrorCode.INVALID_TRANSITION,
            "Invalid status transition",
            http_status=400,
            details={
                "from": current_status.value,
                "to": target_status.value,
            },
        )

    if not system:
        _ensure_actor_can_mutate_tenant(db, actor, enrollment.tenant_id)

    now = datetime.now(timezone.utc)
    old_snapshot = _serialize_enrollment(enrollment)

    if target_status == EnrollmentStatus.ACTIVE:
        plan = get_user_tenant_plan(db, enrollment.user_tenant_plan_id)
        if plan is None or plan.duration is None:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.VALIDATION_ERROR,
                "Enrollment plan has no duration",
                http_status=400,
                details={"user_tenant_plan_id": enrollment.user_tenant_plan_id},
            )
        enrollment.activated_at = now
        enrollment.expires_at = now + timedelta(days=plan.duration)
        enrollment.cancelled_at = None
    elif target_status == EnrollmentStatus.CANCELLED:
        enrollment.cancelled_at = now
    elif target_status == EnrollmentStatus.EXPIRED:
        if enrollment.expires_at is None or enrollment.expires_at >= now:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.INVALID_TRANSITION,
                "Enrollment cannot be expired before its expiry time",
                http_status=400,
                details={
                    "enrollment_id": enrollment.id,
                    "expires_at": (
                        enrollment.expires_at.isoformat() if enrollment.expires_at else None
                    ),
                },
            )

    enrollment.status = target_status

    history = EnrollmentStatusHistory(
        enrollment_id=enrollment.id,
        tenant_id=enrollment.tenant_id,
        old_status=current_status,
        new_status=target_status,
        changed_by=actor.user_id if not system else None,
        changed_by_role=_normalize_role(actor.role) if not system else "SYSTEM",
        reason=reason,
        changed_at=now,
    )

    action = "STATUS_CHANGED"
    if target_status == EnrollmentStatus.EXPIRED and system:
        action = "EXPIRED"

    audit = AuditEvent(
        tenant_id=enrollment.tenant_id,
        entity_type="ENROLLMENT",
        entity_id=enrollment.id,
        action=action,
        old_value=old_snapshot,
        new_value=_serialize_enrollment(enrollment),
        actor_user_id=actor.user_id if not system else None,
    )

    try:
        db.add(history)
        db.add(audit)
        db.commit()
        db.refresh(enrollment)
        return enrollment
    except EnrollmentServiceError:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise


# ============================================================================
# Scoped Reads & Listing
# ============================================================================


def get_enrollment_scoped(
    db: Session,
    *,
    enrollment_id: int,
    actor: ActorContext,
    expected_tenant_id: Optional[int] = None,
) -> Enrollment:
    """
    Retrieve a single enrollment with read-level authorization enforced.
    """
    enrollment = get_enrollment_by_id(db, enrollment_id)
    if enrollment is None:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.NOT_FOUND,
            "Enrollment not found",
            http_status=404,
            details={"enrollment_id": enrollment_id},
        )

    if expected_tenant_id is not None and enrollment.tenant_id != expected_tenant_id:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
            "Enrollment does not belong to the specified tenant",
            http_status=403,
            details={
                "enrollment_id": enrollment_id,
                "tenant_id": expected_tenant_id,
                "enrollment_tenant_id": enrollment.tenant_id,
            },
        )

    _ensure_actor_can_view_enrollment(db, actor, enrollment)
    return enrollment


def list_enrollments_scoped(
    db: Session,
    *,
    tenant_id: int,
    actor: ActorContext,
    patient_user_id: Optional[int] = None,
    status: Optional[EnrollmentStatus] = None,
) -> list[Enrollment]:
    """
    List enrollments within a tenant, applying role-based and tenant-scoped
    authorization rules before delegating to the repository layer.
    """
    role = _normalize_role(actor.role)

    if _is_super_admin(actor):
        pass
    elif role == ROLE_TENANT_MANAGER:
        _ensure_actor_can_mutate_tenant(db, actor, tenant_id)
    elif role == ROLE_PATIENT:
        if actor.user_id is None:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.UNAUTHORIZED,
                "Missing actor user_id for enrollment listing",
                http_status=403,
            )
        if patient_user_id is not None and patient_user_id != actor.user_id:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
                "Patient can only list own enrollments",
                http_status=403,
            )
        patient_user_id = actor.user_id
    elif role == ROLE_DOCTOR:
        if actor.user_id is None:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.UNAUTHORIZED,
                "Missing actor user_id for enrollment listing",
                http_status=403,
            )
        doctor = db.query(Doctor).filter(Doctor.user_id == actor.user_id).first()
        if doctor is None or doctor.tenant_id != tenant_id:
            raise EnrollmentServiceError(
                EnrollmentErrorCode.TENANT_SCOPE_VIOLATION,
                "Doctor does not belong to this tenant",
                http_status=403,
            )
    else:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.UNAUTHORIZED,
            "Actor is not allowed to list enrollments",
            http_status=403,
            details={"role": role},
        )
    enrollments = list_enrollments_by_tenant(
        db,
        tenant_id=tenant_id,
        patient_user_id=patient_user_id,
    )
    if status is not None:
        enrollments = [e for e in enrollments if e.status == status]
    return list(enrollments)


# ============================================================================
# Operational Status
# ============================================================================


def get_operational_status(
    db: Session,
    *,
    enrollment_id: int,
    actor: ActorContext,
    expected_tenant_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Return the operational status of an enrollment.

    If an enrollment is ACTIVE but its expiry time has passed,
    it is automatically transitioned to EXPIRED via a system-driven
    status transition before computing the response.

    The returned structure is deterministic and reflects the
    effective state at the time of evaluation.
    """
    enrollment = get_enrollment_scoped(
        db,
        enrollment_id=enrollment_id,
        actor=actor,
        expected_tenant_id=expected_tenant_id,
    )

    now = datetime.now(timezone.utc)

    if (
        enrollment.status == EnrollmentStatus.ACTIVE
        and enrollment.expires_at is not None
        and enrollment.expires_at < now
    ):
        system_actor = ActorContext(user_id=None, role="SYSTEM")
        enrollment = transition_enrollment(
            db,
            enrollment_id=enrollment.id,
            target_status=EnrollmentStatus.EXPIRED,
            actor=system_actor,
            expected_tenant_id=expected_tenant_id,
            reason="Auto-expired due to operational status check",
            system=True,
        )

    now = datetime.now(timezone.utc)

    is_active = (
        enrollment.status == EnrollmentStatus.ACTIVE
        and enrollment.expires_at is not None
        and enrollment.expires_at > now
    )

    is_expired = enrollment.status == EnrollmentStatus.EXPIRED or (
        enrollment.status == EnrollmentStatus.ACTIVE
        and enrollment.expires_at is not None
        and enrollment.expires_at < now
    )

    return {
        "enrollment_id": enrollment.id,
        "status": (
            enrollment.status.value
            if isinstance(enrollment.status, EnrollmentStatus)
            else str(enrollment.status)
        ),
        "isActive": is_active,
        "expires_at": enrollment.expires_at.isoformat() if enrollment.expires_at else None,
        "isExpired": is_expired,
        "last_updated": (
            enrollment.updated_at.isoformat()
            if hasattr(enrollment, "updated_at") and enrollment.updated_at
            else None
        ),
    }


def get_enrollment_history_scoped(
    db: Session,
    *,
    actor: ActorContext,
    expected_tenant_id: int,
) -> list[EnrollmentStatusHistory]:
    """
    Retrieve all enrollment status history records scoped to a tenant.

    Returns every history entry for every enrollment that belongs to
    the given tenant, ordered by most recent change first.
    """
    return list_enrollment_status_history(
        db,
        tenant_id=expected_tenant_id,
    )


def list_my_enrollments_global(
    db: Session,
    *,
    actor: ActorContext,
) -> list[Enrollment]:
    """
    List all enrollments for the authenticated user
    across all tenants.
    """

    if actor.user_id is None:
        raise EnrollmentServiceError(
            EnrollmentErrorCode.UNAUTHORIZED,
            "User identity missing",
            http_status=401,
        )

    if actor.role != "CLIENT":
        raise EnrollmentServiceError(
            EnrollmentErrorCode.FORBIDDEN,
            "Only clients can access their enrollments",
            http_status=403,
        )

    return db.query(Enrollment).filter(Enrollment.patient_user_id == actor.user_id).all()
