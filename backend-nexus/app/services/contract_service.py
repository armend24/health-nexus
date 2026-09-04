"""
Contract business logic: transitions, validation, eligibility.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.contract import Contract, ContractStatus

# Allowed transitions: from_status -> set(of to_status)
ALLOWED_TRANSITIONS: dict[ContractStatus, set[ContractStatus]] = {
    ContractStatus.DRAFT: {ContractStatus.ACTIVE, ContractStatus.TERMINATED},
    ContractStatus.ACTIVE: {ContractStatus.EXPIRED, ContractStatus.TERMINATED},
    ContractStatus.EXPIRED: set(),
    ContractStatus.TERMINATED: set(),
}


def can_transition(from_status: ContractStatus, to_status: ContractStatus) -> bool:
    return to_status in ALLOWED_TRANSITIONS.get(from_status, set())


def transition_contract(
    db: Session,
    contract: Contract,
    next_status: ContractStatus,
    reason: str | None = None,
) -> Contract:
    """
    Apply status transition with validation.
    Raises ValueError on invalid transition or failed validation.
    """
    current = contract.status
    if not can_transition(current, next_status):
        raise ValueError(f"Invalid transition: {current.value} → {next_status.value}")

    if next_status == ContractStatus.TERMINATED and not (reason or "").strip():
        raise ValueError("Terminate requires a reason")

    if next_status == ContractStatus.ACTIVE:
        if contract.activated_at is None:
            contract.activated_at = datetime.now(timezone.utc)
        # Use end_date if set, else expires_at for validity check
        end_ref = contract.end_date if contract.end_date is not None else contract.expires_at
        if end_ref is not None and contract.activated_at >= end_ref:
            raise ValueError("end_date/expires_at must be after activated_at")
        if contract.start_date is not None and contract.end_date is not None:
            if contract.start_date >= contract.end_date:
                raise ValueError("end_date must be after start_date")

    if next_status == ContractStatus.TERMINATED:
        contract.terminated_reason = (reason or "").strip()

    contract.status = next_status
    return contract


def has_active_contract(db: Session, tenant_id: int) -> bool:
    """
    Has active contract for tenant? (legacy/tenant-level check)
    status == ACTIVE, activated_at <= now, (expires_at null or >= now)
    """
    now = datetime.now(timezone.utc)
    return (
        db.query(Contract)
        .filter(
            Contract.tenant_id == tenant_id,
            Contract.status == ContractStatus.ACTIVE,
            Contract.activated_at <= now,
            (Contract.expires_at.is_(None)) | (Contract.expires_at >= now),
        )
        .first()
        is not None
    )


def has_active_contract_for_doctor(db: Session, doctor_user_id: int) -> bool:
    """
    Has active contract for doctor? Used by booking to ensure doctor has valid contract.
    status == ACTIVE, start_date <= now <= end_date (or end_date null).
    """
    now = datetime.now(timezone.utc)
    return (
        db.query(Contract)
        .filter(
            Contract.doctor_user_id == doctor_user_id,
            Contract.status == ContractStatus.ACTIVE,
        )
        .filter((Contract.start_date.is_(None)) | (Contract.start_date <= now))
        .filter((Contract.end_date.is_(None)) | (Contract.end_date >= now))
        .first()
        is not None
    )
