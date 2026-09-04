import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.auth.auth_utils import require_permission
from app.db import get_db
from app.models.notification import NotificationType
from app.models.payment import Payment, PaymentStatus, PaymentType
from app.models.subscription_plan import SubscriptionPlan
from app.models.tenant_subscription import SubscriptionStatus, TenantSubscription
from app.models.tenant import Tenant
from app.schemas.tenant_subscription import (
    AdminTenantSubscriptionRead,
    AdminTenantSubscriptionStatus,
    AdminTenantSubscriptionTransitionRequest,
)
from app.services.notification_service import create_notifications_for_tenant_managers
from app.services.subscription_request_stream import (
    format_sse_message,
    subscription_request_stream,
)

router = APIRouter(prefix="/superadmin/subscriptions", tags=["Super Admin Subscriptions"])


def _resolve_admin_status(subscription: TenantSubscription) -> AdminTenantSubscriptionStatus:
    if subscription.cancelled_at is not None:
        return AdminTenantSubscriptionStatus.CANCELLED
    if subscription.status == SubscriptionStatus.ACTIVE:
        return AdminTenantSubscriptionStatus.ACTIVE
    if subscription.status == SubscriptionStatus.EXPIRED and subscription.activated_at is None:
        return AdminTenantSubscriptionStatus.PENDING
    return AdminTenantSubscriptionStatus.EXPIRED


def _serialize_admin_subscription(
    subscription: TenantSubscription,
    latest_payment: Payment | None,
) -> AdminTenantSubscriptionRead:
    return AdminTenantSubscriptionRead(
        id=subscription.id,
        tenant_id=subscription.tenant_id,
        subscription_plan_id=subscription.subscription_plan_id,
        status=subscription.status.value,
        activated_at=subscription.activated_at,
        expires_at=subscription.expires_at,
        cancelled_at=subscription.cancelled_at,
        cancellation_reason=subscription.cancellation_reason,
        admin_status=_resolve_admin_status(subscription),
        latest_payment_status=latest_payment.status.value if latest_payment else None,
        latest_payment_amount=float(latest_payment.price) if latest_payment else None,
        tenant_name=subscription.tenant.name,
        subscription_plan_name=subscription.subscription_plan.name,
        created_at=subscription.created_at,
        updated_at=subscription.updated_at,
        latest_payment_id=latest_payment.payment_id if latest_payment else None,
    )


def _load_latest_payments(db: Session, subscription_ids: list[int]) -> dict[int, Payment]:
    if not subscription_ids:
        return {}

    payments = (
        db.query(Payment)
        .filter(
            Payment.payment_type == PaymentType.TENANT_SUBSCRIPTION,
            Payment.reference_id.in_(subscription_ids),
        )
        .order_by(Payment.reference_id.asc(), Payment.updated_at.desc(), Payment.payment_id.desc())
        .all()
    )

    latest_by_subscription: dict[int, Payment] = {}
    for payment in payments:
        if payment.reference_id not in latest_by_subscription:
            latest_by_subscription[payment.reference_id] = payment
    return latest_by_subscription


@router.get("", response_model=list[AdminTenantSubscriptionRead])
def list_subscription_requests(
    status_filter: AdminTenantSubscriptionStatus | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_permission("auth:admin")),
):
    subscriptions = (
        db.query(TenantSubscription)
        .options(
            joinedload(TenantSubscription.tenant).load_only(Tenant.id, Tenant.name),
            joinedload(TenantSubscription.subscription_plan).load_only(SubscriptionPlan.id, SubscriptionPlan.name),
        )
        .order_by(TenantSubscription.created_at.asc(), TenantSubscription.id.asc())
        .all()
    )

    latest_by_subscription = _load_latest_payments(db, [subscription.id for subscription in subscriptions])

    serialized: list[AdminTenantSubscriptionRead] = []
    for subscription in subscriptions:
        item = _serialize_admin_subscription(
            subscription,
            latest_by_subscription.get(subscription.id),
        )
        if status_filter is not None and item.admin_status != status_filter:
            continue
        serialized.append(item)

    return serialized


@router.get("/stream")
async def stream_subscription_requests(
    request: Request,
    _: dict = Depends(require_permission("auth:admin")),
):
    async def event_generator():
        queue = await subscription_request_stream.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=20)
                    yield format_sse_message("subscription-ready", payload)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            await subscription_request_stream.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/{subscription_id}/transition", response_model=AdminTenantSubscriptionRead)
def transition_subscription_request(
    subscription_id: int,
    request: AdminTenantSubscriptionTransitionRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_permission("auth:admin")),
):
    subscription = (
        db.query(TenantSubscription)
        .options(
            joinedload(TenantSubscription.tenant).load_only(Tenant.id, Tenant.name),
            joinedload(TenantSubscription.subscription_plan).load_only(SubscriptionPlan.id, SubscriptionPlan.name),
        )
        .filter(TenantSubscription.id == subscription_id)
        .first()
    )

    if not subscription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription request not found")

    latest_payment = (
        db.query(Payment)
        .filter(
            Payment.payment_type == PaymentType.TENANT_SUBSCRIPTION,
            Payment.reference_id == subscription.id,
        )
        .order_by(Payment.updated_at.desc(), Payment.payment_id.desc())
        .first()
    )

    admin_status = _resolve_admin_status(subscription)
    if request.target == AdminTenantSubscriptionStatus.ACTIVE:
        if admin_status != AdminTenantSubscriptionStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending subscription requests can be approved",
            )
    elif request.target == AdminTenantSubscriptionStatus.CANCELLED:
        if admin_status not in {
            AdminTenantSubscriptionStatus.PENDING,
            AdminTenantSubscriptionStatus.ACTIVE,
        }:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending or active subscriptions can be cancelled",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported transition target",
        )

    now = datetime.now(timezone.utc)

    if request.target == AdminTenantSubscriptionStatus.ACTIVE:
        if latest_payment is None or latest_payment.status != PaymentStatus.CAPTURED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The subscription can only be approved after payment is captured",
            )

        previous_active_subscription = (
            db.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == subscription.tenant_id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
                TenantSubscription.activated_at.isnot(None),
            )
            .order_by(TenantSubscription.activated_at.desc(), TenantSubscription.id.desc())
            .first()
        )

        if previous_active_subscription and previous_active_subscription.id != subscription.id:
            previous_active_subscription.status = SubscriptionStatus.EXPIRED
            previous_active_subscription.cancelled_at = now
            previous_active_subscription.cancellation_reason = (
                f"Replaced with {subscription.subscription_plan.name}"
            )

        subscription.status = SubscriptionStatus.ACTIVE
        subscription.activated_at = now
        subscription.expires_at = now + timedelta(days=subscription.subscription_plan.duration)
        subscription.cancelled_at = None
        subscription.cancellation_reason = None
    elif request.target == AdminTenantSubscriptionStatus.CANCELLED:
        was_active_subscription = admin_status == AdminTenantSubscriptionStatus.ACTIVE
        if admin_status == AdminTenantSubscriptionStatus.ACTIVE:
            subscription.status = SubscriptionStatus.EXPIRED
            subscription.expires_at = now
        subscription.cancelled_at = now
        subscription.cancellation_reason = request.reason or "Cancelled subscription"

        if was_active_subscription:
            create_notifications_for_tenant_managers(
                db,
                tenant_id=subscription.tenant_id,
                notification_type=NotificationType.TENANT_SUBSCRIPTION_CANCELLED,
                title="Subscription Cancelled",
                message=(
                    f"Your {subscription.subscription_plan.name} subscription was cancelled. "
                    f"Reason: {subscription.cancellation_reason}"
                ),
                entity_type="tenant_subscription",
                entity_id=subscription.id,
            )

    db.commit()
    db.refresh(subscription)

    return _serialize_admin_subscription(subscription, latest_payment)
