from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.orm import Session, joinedload

from app.models import (
    Enrollment,
    EnrollmentStatusHistory,
    AuditEvent,
    Tenant,
    Patient,
    UserTenantPlan,
    TenantManager,
    Doctor,
)

# ---------------------------------------------------------------------------
# Tenant / Patient / Plan Retrieval
# ---------------------------------------------------------------------------


def get_tenant(db: Session, tenant_id: int) -> Optional[Tenant]:
    """
    Retrieve a Tenant by its primary key.

    Args:
        db: Active SQLAlchemy session.
        tenant_id: Primary key of the Tenant.

    Returns:
        The Tenant instance if found, otherwise None.
    """
    return db.query(Tenant).filter(Tenant.id == tenant_id).first()


def get_patient_by_tenant_and_user(
    db: Session,
    *,
    tenant_id: int,
    patient_user_id: int,
) -> Optional[Patient]:
    """
    Retrieve a Patient scoped to a tenant and user identifier.

    Args:
        db: Active SQLAlchemy session.
        tenant_id: Identifier of the Tenant.
        patient_user_id: User ID linked to the Patient record.

    Returns:
        The Patient instance if found within the tenant, otherwise None.
    """
    return (
        db.query(Patient)
        .filter(
            Patient.tenant_id == tenant_id,
            Patient.user_id == patient_user_id,
        )
        .first()
    )


def get_patient_by_user(db: Session, patient_user_id: int) -> Optional[Patient]:
    """
    Retrieve any Patient by associated user_id (cross-tenant).

    This helper is only used to distinguish "not found" from
    "exists but in a different tenant" for deterministic API errors.
    """
    return db.query(Patient).filter(Patient.user_id == patient_user_id).first()


def get_user_tenant_plan(db: Session, plan_id: int) -> Optional[UserTenantPlan]:
    """
    Retrieve a UserTenantPlan by its primary key.

    Args:
        db: Active SQLAlchemy session.
        plan_id: Primary key of the UserTenantPlan.

    Returns:
        The UserTenantPlan instance if found, otherwise None.
    """
    return db.query(UserTenantPlan).filter(UserTenantPlan.id == plan_id).first()


# ---------------------------------------------------------------------------
# Enrollment Retrieval
# ---------------------------------------------------------------------------


def get_enrollment_by_id(db: Session, enrollment_id: int) -> Optional[Enrollment]:
    """
    Retrieve an Enrollment by its primary key.

    Args:
        db: Active SQLAlchemy session.
        enrollment_id: Primary key of the Enrollment.

    Returns:
        The Enrollment instance if found, otherwise None.
    """
    return db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()


def get_enrollment_by_tenant_and_patient(
    db: Session,
    tenant_id: int,
    patient_user_id: int,
) -> Optional[Enrollment]:
    """
    Retrieve an Enrollment by tenant and patient identifiers.

    This is typically used to enforce uniqueness of the
    (tenant_id, patient_user_id) pair at the service layer
    before a database constraint is triggered.

    Args:
        db: Active SQLAlchemy session.
        tenant_id: Identifier of the Tenant.
        patient_user_id: User ID linked to the Patient.

    Returns:
        The matching Enrollment if found, otherwise None.
    """
    return (
        db.query(Enrollment)
        .filter(
            Enrollment.tenant_id == tenant_id,
            Enrollment.patient_user_id == patient_user_id,
        )
        .first()
    )


def list_enrollments_by_tenant(
    db: Session,
    tenant_id: int,
    patient_user_id: Optional[int] = None,
) -> Iterable[Enrollment]:
    """
    List all enrollments for a given tenant, optionally filtered by patient.

    Args:
        db: Active SQLAlchemy session.
        tenant_id: Identifier of the Tenant.
        patient_user_id: Optional user ID linked to a Patient.
                         If provided, results are filtered accordingly.

    Returns:
        An iterable of Enrollment instances.
    """
    query = db.query(Enrollment).filter(Enrollment.tenant_id == tenant_id)

    if patient_user_id is not None:
        query = query.filter(Enrollment.patient_user_id == patient_user_id)

    return query.all()


# ---------------------------------------------------------------------------
# Role / Relationship Lookups
# ---------------------------------------------------------------------------


def get_tenant_manager(
    db: Session,
    user_id: int,
    tenant_id: int,
) -> Optional[TenantManager]:
    """
    Retrieve a TenantManager by user and tenant identifiers.

    Args:
        db: Active SQLAlchemy session.
        user_id: Identifier of the User.
        tenant_id: Identifier of the Tenant.

    Returns:
        The TenantManager instance if found, otherwise None.
    """
    return (
        db.query(TenantManager)
        .filter(
            TenantManager.user_id == user_id,
            TenantManager.tenant_id == tenant_id,
        )
        .first()
    )


def get_doctor_for_user(db: Session, user_id: int) -> Optional[Doctor]:
    """
    Retrieve a Doctor record associated with a given user.

    Args:
        db: Active SQLAlchemy session.
        user_id: Identifier of the User.

    Returns:
        The Doctor instance if found, otherwise None.
    """
    return db.query(Doctor).filter(Doctor.user_id == user_id).first()


# ---------------------------------------------------------------------------
# Write Operations (History / Audit)
# ---------------------------------------------------------------------------


def insert_status_history(
    db: Session,
    history: EnrollmentStatusHistory,
) -> None:
    """
    Persist an EnrollmentStatusHistory record.

    The object is added to the current session and flushed to ensure
    it is written to the database within the current transaction
    (without committing).

    Args:
        db: Active SQLAlchemy session.
        history: Pre-constructed EnrollmentStatusHistory entity.
    """
    db.add(history)
    db.flush()


def insert_audit_event(
    db: Session,
    event: AuditEvent,
) -> None:
    """
    Persist an AuditEvent record.

    The object is added to the current session and flushed to ensure
    it is written to the database within the current transaction
    (without committing).

    Args:
        db: Active SQLAlchemy session.
        event: Pre-constructed AuditEvent entity.
    """
    db.add(event)
    db.flush()

    # ---------------------------------------------------------------------------


# Enrollment Status History Retrieval
# ---------------------------------------------------------------------------


def list_enrollment_status_history(
    db: Session,
    *,
    tenant_id: int,
) -> list[EnrollmentStatusHistory]:
    """
    Retrieve status history records for a given enrollment scoped to tenant.
    """

    return (
        db.query(EnrollmentStatusHistory)
        .filter(
            EnrollmentStatusHistory.tenant_id == tenant_id,
        )
        .order_by(EnrollmentStatusHistory.changed_at.desc())
        .all()
    )
