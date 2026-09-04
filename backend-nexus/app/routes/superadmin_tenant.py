# Thus file holds endpoints related to tenant management for the Super Admin dashboard
# (e.g: list tenants, view tenant details, approve/reject/suspend tenants etc).

from fastapi import APIRouter, HTTPException, Depends, status, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Dict, Any
from app.db import SessionLocal, get_db
from app.auth.auth_utils import require_permission
from app.models.tenant import Tenant, TenantStatus
from app.models.subscription_plan import SubscriptionPlan
from app.models.tenant_subscription import TenantSubscription, SubscriptionStatus
from app.schemas.tenant import TenantRead, TenantStatusUpdate, TenantListResponse
from app.services.audit_service import create_audit_log
from app.models.tenant_audit_log import TenantAuditEventType

router = APIRouter(prefix="/tenants", tags=["Super Admin - Tenant Management"])


# Simple endpoint to list all tenant emails (for CI/CD test)
@router.get("/emails", response_model=list[str])
def list_tenant_emails(
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("auth:admin")),
):
    emails = db.query(Tenant.email).all()
    return [email for (email,) in emails]


# Endpoint to list tenants for the Super Admin dashboard.
# Supports optional filtering by status and search (name).
# Supports pagination with default page size of 10.
@router.get("", response_model=TenantListResponse)
def list_tenants(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    status_filter: TenantStatus | None = Query(default=None, alias="status"),
    search: str | None = None,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("auth:admin")),
):
    query = db.query(Tenant)

    if status_filter:
        query = query.filter(Tenant.status == status_filter)

    if search:
        query = query.filter(Tenant.name.ilike(f"%{search}%"))

    query = query.order_by(Tenant.id.desc())

    # Get total count before pagination
    total = query.count()

    # Apply pagination
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()

    return TenantListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


# Gets tenant details for the Super Admin dashboard tenant details page.
@router.get("/{tenant_id}", response_model=TenantRead)
def get_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("auth:admin")),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    return tenant


# Endpoint to update tenant status (approve/reject/suspend/activate) from the Super Admin dashboard tenant details/modal page.
# It is through this endpoint that the Tenant lifecycle will be managed (e.g: pending -> approved, approved -> suspended etc).
@router.patch("/{tenant_id}/status", response_model=TenantRead)
def update_tenant_status(
    tenant_id: int,
    status_update: TenantStatusUpdate,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("auth:admin")),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    current_status = tenant.status
    new_status = status_update.status

    allowed_transitions = {
        TenantStatus.pending: [TenantStatus.approved, TenantStatus.rejected],
        TenantStatus.approved: [TenantStatus.suspended, TenantStatus.archived],
        TenantStatus.suspended: [TenantStatus.approved, TenantStatus.archived],
        TenantStatus.rejected: [TenantStatus.archived],
        TenantStatus.archived: [],
    }

    # If same status is sent (e.g: update tenant status from approved to approved), we can short-circuit and return a 400
    if current_status == new_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tenant is already in '{new_status.value}' status",
        )

    # If mistakenly an invalid transition (pending -> suspended) is attempted, return a 400 with allowed transitions info
    if new_status not in allowed_transitions.get(current_status, []):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status transition: '{current_status.value}' → '{new_status.value}'",
        )

    # If approving a tenant for the first time (pending -> approved), create a FREE subscription
    # When the superadmin approves a tenant for the first time, we want to automatically create a FREE subscription..
    if current_status == TenantStatus.pending and new_status == TenantStatus.approved:
        # Find the FREE membership plan
        free_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == "FREE").first()

        if not free_plan:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="FREE plan not found in database",
            )

        # Check if tenant already has a subscription
        existing_subscription = (
            db.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == tenant_id,
                TenantSubscription.expires_at > datetime.now(timezone.utc),
                TenantSubscription.activated_at.isnot(None),
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )

        # If there is no subscription yet, create a new subscription with the FREE plan
        if not existing_subscription:
            activated_at = datetime.now(timezone.utc)

            expires_at = activated_at + timedelta(days=free_plan.duration)

            new_subscription = TenantSubscription(
                tenant_id=tenant_id,
                subscription_plan_id=free_plan.id,
                activated_at=activated_at,
                expires_at=expires_at,
                status=SubscriptionStatus.ACTIVE,
            )

            db.add(new_subscription)

    tenant.status = new_status

    # AUDIT LOG ENTRY
    create_audit_log(
        db=db,
        tenant_id=tenant.id,
        event_type=TenantAuditEventType.STATUS_CHANGE,
        entity_name="tenant",
        entity_id=tenant.id,
        old_value={"status": current_status.value},
        new_value={"status": new_status.value},
        performed_by_user_id=user["user_id"],
        performed_by_role="SUPER_ADMIN",
        reason=status_update.reason,
    )
    db.commit()
    db.refresh(tenant)

    return tenant
