"""
Checkout initiation and payment intent flow (PRD-10).
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user, normalize_role
from app.db import get_db
from app.models.payment import Payment, PaymentStatus, PaymentType
from app.models.tenant_manager import TenantManager
from app.schemas.payment import (
    CheckoutInitiateRequest,
    CheckoutInitiateResponse,
    CheckoutPaymentStatusResponse,
)
from app.services.payment_service import (
    PaymentServiceError,
    create_or_get_enrollment_payment,
    create_or_get_order_payment,
    create_or_get_tenant_subscription_payment,
    process_stripe_webhook,
    sync_payment_status_with_provider,
)

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/checkout",
    tags=["Checkout"],
)


def _ensure_payment_sync_access(
    db: Session,
    payment: Payment,
    user: Dict[str, Any],
):
    if normalize_role(user.get("role")) == "super_admin":
        return

    if payment.payment_type != PaymentType.TENANT_SUBSCRIPTION:
        raise HTTPException(
            status_code=403,
            detail="Only super admins can sync this payment type",
        )

    manager = (
        db.query(TenantManager)
        .filter(
            TenantManager.user_id == int(user.get("user_id") or 0),
            TenantManager.tenant_id == payment.tenant_id,
        )
        .first()
    )
    if manager is None:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this payment",
        )


def _error_response(exc: PaymentServiceError) -> JSONResponse:
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


@router.post(
    "/initiate",
    response_model=CheckoutInitiateResponse,
    status_code=200,
)
def checkout_initiate(
    payload: CheckoutInitiateRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Create or return an idempotent checkout Payment for order/enrollment/subscription."""
    user_id = user.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token: missing user_id")

    key = (idempotency_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Idempotency-Key header is required and must be non-empty",
        )

    target_count = sum(
        value is not None
        for value in (
            payload.order_id,
            payload.enrollment_id,
            payload.tenant_subscription_id,
        )
    )
    if target_count != 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "Exactly one checkout reference is required: "
                "order_id, enrollment_id, or tenant_subscription_id"
            ),
        )

    try:
        if payload.order_id is not None:
            payment, stripe_client_secret = create_or_get_order_payment(
                db=db,
                order_id=payload.order_id,
                user_id=int(user_id),
                idempotency_key=key,
            )
        elif payload.enrollment_id is not None:
            payment, stripe_client_secret = create_or_get_enrollment_payment(
                db=db,
                enrollment_id=payload.enrollment_id,
                user_id=int(user_id),
                idempotency_key=key,
            )
        else:
            tenant_subscription_id = payload.tenant_subscription_id
            if tenant_subscription_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="tenant_subscription_id is required for tenant subscription checkout",
                )
            payment, stripe_client_secret = create_or_get_tenant_subscription_payment(
                db=db,
                tenant_subscription_id=tenant_subscription_id,
                user_id=int(user_id),
                idempotency_key=key,
            )
    except PaymentServiceError as exc:
        return _error_response(exc)

    status_value = (
        payment.status.value if isinstance(payment.status, PaymentStatus) else str(payment.status)
    )
    return CheckoutInitiateResponse(
        payment_id=payment.payment_id,
        status=status_value,
        stripe_payment_intent_id=payment.stripe_payment_intent_id,
        stripe_client_secret=stripe_client_secret,
        amount=float(payment.price),
        tenant_id=payment.tenant_id,
    )


@router.post(
    "/payments/{payment_id}/sync",
    response_model=CheckoutPaymentStatusResponse,
    status_code=200,
)
def sync_checkout_payment_status(
    payment_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")

    _ensure_payment_sync_access(db, payment, user)

    try:
        payment = sync_payment_status_with_provider(db, payment_id)
    except PaymentServiceError as exc:
        return _error_response(exc)

    return CheckoutPaymentStatusResponse(
        payment_id=payment.payment_id,
        status=payment.status.value,
        stripe_payment_intent_id=payment.stripe_payment_intent_id,
    )


@router.post("/webhook/stripe", status_code=200)
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
    db: Session = Depends(get_db),
):
    """
    Stripe webhook endpoint for post-payment lifecycle updates.

    Handles payment_intent.succeeded and marks internal payment state as CAPTURED,
    then activates related domain entities (order/enrollment/subscription) where applicable.
    """
    payload = await request.body()
    try:
        result = process_stripe_webhook(
            db=db,
            payload=payload,
            signature=stripe_signature,
        )
    except PaymentServiceError as exc:
        logger.warning(
            "Stripe webhook rejected",
            extra={
                "code": exc.code,
                "error_message": exc.message,
                "details": exc.details,
            },
        )
        return _error_response(exc)
    except Exception:
        logger.exception("Unexpected Stripe webhook failure")
        raise

    return {"received": True, **result}
