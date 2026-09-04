"""Subscription Plan Management Routes"""

from fastapi import APIRouter, HTTPException, Depends, status
from app.models import (
    TenantSubscription,
    TenantManager,
    SubscriptionPlan,
    Doctor,
    Enrollment,
    TenantDepartment,
)
from app.models.payment import Payment, PaymentType
from app.models.tenant_subscription import SubscriptionStatus
from app.models.enrollment import EnrollmentStatus
from app.schemas.tenant_subscription import (
    AdminTenantSubscriptionStatus,
    TenantSubscriptionRead,
    ChangePlanRequest,
    SubscriptionStatsRead,
    TenantSubscriptionRequestRead,
)
from app.db import get_db
from sqlalchemy.orm import Session
from app.auth.auth_utils import get_current_user
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/subscription_plan", tags=["Nexus Health Subscription Plans"])


# Helper functions to reduce code duplication


def get_tenant_id_from_user(db: Session, current_user: dict) -> int:
    """Extract tenant_id from authenticated user via TenantManager lookup"""
    user_id = current_user.get("user_id")

    tenant_manager = db.query(TenantManager).filter(TenantManager.user_id == user_id).first()

    if not tenant_manager:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User is not a tenant manager"
        )

    return tenant_manager.tenant_id


def get_active_subscription(db: Session, tenant_id: int) -> TenantSubscription:
    """Retrieve the currently active (non-expired) subscription for a tenant"""
    current_subscription = (
        db.query(TenantSubscription)
        .filter(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.expires_at > datetime.now(timezone.utc),
            TenantSubscription.activated_at.isnot(None),
            TenantSubscription.status == SubscriptionStatus.ACTIVE,
        )
        .first()
    )

    if not current_subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription found for this tenant",
        )

    return current_subscription


def get_active_subscription_or_none(
    db: Session, tenant_id: int
) -> TenantSubscription | None:
    """Retrieve the currently active subscription for a tenant when present."""
    return (
        db.query(TenantSubscription)
        .filter(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.expires_at > datetime.now(timezone.utc),
            TenantSubscription.activated_at.isnot(None),
            TenantSubscription.status == SubscriptionStatus.ACTIVE,
        )
        .first()
    )


def get_resource_counts(db: Session, tenant_id: int) -> dict:
    """Count active doctors, patients, and departments for a tenant"""
    doctor_count = (
        db.query(Doctor).filter(Doctor.tenant_id == tenant_id, Doctor.is_active == True).count()
    )

    patient_count = (
        db.query(Enrollment)
        .filter(Enrollment.tenant_id == tenant_id, Enrollment.status == EnrollmentStatus.ACTIVE)
        .count()
    )

    department_count = (
        db.query(TenantDepartment).filter(TenantDepartment.tenant_id == tenant_id).count()
    )

    return {
        "doctors": doctor_count,
        "patients": patient_count,
        "departments": department_count,
    }


def serialize_subscription_request(
    subscription: TenantSubscription,
    latest_payment: Payment | None,
) -> TenantSubscriptionRequestRead:
    if subscription.cancelled_at is not None:
        admin_status = AdminTenantSubscriptionStatus.CANCELLED
    elif subscription.status == SubscriptionStatus.ACTIVE:
        admin_status = AdminTenantSubscriptionStatus.ACTIVE
    elif subscription.status == SubscriptionStatus.EXPIRED and subscription.activated_at is None:
        admin_status = AdminTenantSubscriptionStatus.PENDING
    else:
        admin_status = AdminTenantSubscriptionStatus.EXPIRED

    return TenantSubscriptionRequestRead(
        id=subscription.id,
        tenant_id=subscription.tenant_id,
        subscription_plan_id=subscription.subscription_plan_id,
        status=subscription.status.value,
        activated_at=subscription.activated_at,
        expires_at=subscription.expires_at,
        cancelled_at=subscription.cancelled_at,
        cancellation_reason=subscription.cancellation_reason,
        admin_status=admin_status,
        latest_payment_status=latest_payment.status.value if latest_payment else None,
        latest_payment_amount=float(latest_payment.price) if latest_payment else None,
    )


# Endpoint handlers


@router.get("/current", response_model=TenantSubscriptionRead)
def get_current_subscription(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get the currently active subscription for the authenticated tenant manager"""
    tenant_id = get_tenant_id_from_user(db, current_user)
    return get_active_subscription(db, tenant_id)


@router.get("/stats", response_model=SubscriptionStatsRead)
def get_subscription_stats(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get current resource usage stats for the tenant manager's organization.
    Returns: doctors used, patients used, departments used, and current plan info.
    """
    tenant_id = get_tenant_id_from_user(db, current_user)
    current_subscription = get_active_subscription_or_none(db, tenant_id)
    resource_counts = get_resource_counts(db, tenant_id)

    return {
        "doctors_used": resource_counts["doctors"],
        "patients_used": resource_counts["patients"],
        "departments_used": resource_counts["departments"],
        "current_plan_id": (
            current_subscription.subscription_plan_id
            if current_subscription is not None
            else None
        ),
        "current_plan_name": (
            current_subscription.subscription_plan.name
            if current_subscription is not None
            else None
        ),
    }


@router.get("/request/{subscription_id}", response_model=TenantSubscriptionRequestRead)
def get_subscription_request(
    subscription_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_tenant_id_from_user(db, current_user)

    subscription = (
        db.query(TenantSubscription)
        .filter(
            TenantSubscription.id == subscription_id,
            TenantSubscription.tenant_id == tenant_id,
        )
        .first()
    )

    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription request not found",
        )

    latest_payment = (
        db.query(Payment)
        .filter(
            Payment.payment_type == PaymentType.TENANT_SUBSCRIPTION,
            Payment.reference_id == subscription.id,
        )
        .order_by(Payment.updated_at.desc(), Payment.payment_id.desc())
        .first()
    )

    return serialize_subscription_request(subscription, latest_payment)


@router.post("/change", response_model=TenantSubscriptionRead)
def change_subscription_plan(
    request: ChangePlanRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Change subscription plan for the tenant manager's organization.
    Validates that:
    - Downgrades (lower price) are not allowed
    - New plan can accommodate existing resources
    """
    tenant_id = get_tenant_id_from_user(db, current_user)
    current_subscription = get_active_subscription_or_none(db, tenant_id)

    current_plan = None
    if current_subscription is not None:
        current_plan = (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.id == current_subscription.subscription_plan_id)
            .first()
        )

    # Get the new plan
    new_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == request.new_plan_id).first()

    if not new_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subscription plan with ID {request.new_plan_id} not found",
        )

    # Prevent downgrades: check if new plan price is lower than current plan
    new_price = float(new_plan.price)

    if current_plan is not None and new_price < float(current_plan.price):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot downgrade from {current_plan.name} (${float(current_plan.price):.2f}) to {new_plan.name} (${new_price:.2f}). Plan downgrades are not allowed mid-cycle. Please wait until your billing cycle ends.",
        )

    # Get current resource counts
    resource_counts = get_resource_counts(db, tenant_id)
    doctor_count = resource_counts["doctors"]
    patient_count = resource_counts["patients"]
    department_count = resource_counts["departments"]

    # Validate: if new plan has lower limits, check if resources fit
    # If new_plan limit is None, it means unlimited
    if new_plan.max_doctors is not None and doctor_count > new_plan.max_doctors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot downgrade to {new_plan.name}. You have {doctor_count} doctors but the plan supports only {new_plan.max_doctors}. Please remove {doctor_count - new_plan.max_doctors} doctor(s) first.",
        )

    if new_plan.max_patients is not None and patient_count > new_plan.max_patients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot downgrade to {new_plan.name}. You have {patient_count} patients but the plan supports only {new_plan.max_patients}. Please remove {patient_count - new_plan.max_patients} patient(s) first.",
        )

    if new_plan.max_departments is not None and department_count > new_plan.max_departments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot downgrade to {new_plan.name}. You have {department_count} departments but the plan supports only {new_plan.max_departments}. Please remove {department_count - new_plan.max_departments} department(s) first.",
        )

    now = datetime.now(timezone.utc)
    if new_price <= 0:
        expires_at = now + timedelta(days=new_plan.duration)
        new_subscription = TenantSubscription(
            tenant_id=tenant_id,
            subscription_plan_id=request.new_plan_id,
            status=SubscriptionStatus.ACTIVE,
            activated_at=now,
            expires_at=expires_at,
        )

        db.add(new_subscription)
        if current_subscription is not None:
            current_subscription.status = SubscriptionStatus.EXPIRED
            current_subscription.cancelled_at = now
            current_subscription.cancellation_reason = f"Replaced with {new_plan.name}"

        db.commit()
        db.refresh(new_subscription)
        return new_subscription

    existing_pending_subscription = (
        db.query(TenantSubscription)
        .filter(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.subscription_plan_id == request.new_plan_id,
            TenantSubscription.status == SubscriptionStatus.EXPIRED,
            TenantSubscription.activated_at.is_(None),
            TenantSubscription.cancelled_at.is_(None),
        )
        .order_by(TenantSubscription.id.desc())
        .first()
    )
    if existing_pending_subscription is not None:
        return existing_pending_subscription

    pending_subscription = TenantSubscription(
        tenant_id=tenant_id,
        subscription_plan_id=request.new_plan_id,
        status=SubscriptionStatus.EXPIRED,
        activated_at=None,
        expires_at=None,
        cancelled_at=None,
        cancellation_reason=f"Awaiting payment for {new_plan.name}",
    )

    db.add(pending_subscription)
    db.commit()
    db.refresh(pending_subscription)

    return pending_subscription
