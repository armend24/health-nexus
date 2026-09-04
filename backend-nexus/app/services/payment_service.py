"""
Payment service: checkout initiation with idempotency and order validation.
"""

from __future__ import annotations

import enum
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import stripe
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import (
    get_stripe_currency,
    get_stripe_secret_key,
    get_stripe_webhook_secret,
)
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.order import Order, OrderStatus
from app.models.payment import Payment, PaymentStatus, PaymentType
from app.models.subscription_plan import SubscriptionPlan
from app.models.tenant_manager import TenantManager
from app.models.tenant_subscription import SubscriptionStatus, TenantSubscription
from app.models.user_tenant_plan import UserTenantPlan
from app.services.subscription_request_stream import subscription_request_stream


class PaymentErrorCode(str, enum.Enum):
    NOT_FOUND = "NOT_FOUND"
    FORBIDDEN = "FORBIDDEN"
    CONFLICT = "CONFLICT"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    PAYMENT_PROVIDER_ERROR = "PAYMENT_PROVIDER_ERROR"


class PaymentServiceError(Exception):
    def __init__(
        self,
        code: PaymentErrorCode,
        message: str,
        http_status: int,
        details: Optional[dict] = None,
    ) -> None:
        super().__init__(message)
        self.code = code.value
        self.message = message
        self.http_status = http_status
        self.details = details or {}


WEBHOOK_EVENT_STATUS_MAP = {
    "payment_intent.succeeded": PaymentStatus.CAPTURED,
    "payment_intent.payment_failed": PaymentStatus.FAILED,
    "payment_intent.canceled": PaymentStatus.CANCELED,
    "charge.dispute.created": PaymentStatus.DISPUTED,
}

ALLOWED_PAYMENT_TRANSITIONS = {
    PaymentStatus.INITIATED: {
        PaymentStatus.CAPTURED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELED,
        PaymentStatus.REQUIRES_MANUAL_INTERVENTION,
    },
    PaymentStatus.AUTHORIZED: {
        PaymentStatus.CAPTURED,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELED,
        PaymentStatus.REQUIRES_MANUAL_INTERVENTION,
    },
    PaymentStatus.CAPTURED: {
        PaymentStatus.DISPUTED,
        PaymentStatus.REFUNDED,
        PaymentStatus.REQUIRES_MANUAL_INTERVENTION,
    },
    PaymentStatus.FAILED: {PaymentStatus.REQUIRES_MANUAL_INTERVENTION},
    PaymentStatus.CANCELED: {PaymentStatus.REQUIRES_MANUAL_INTERVENTION},
    PaymentStatus.DISPUTED: {PaymentStatus.REQUIRES_MANUAL_INTERVENTION},
    PaymentStatus.REQUIRES_MANUAL_INTERVENTION: set(),
    PaymentStatus.REFUNDED: set(),
}


def _amount_to_minor_units(amount: float) -> int:
    """Convert decimal major-unit amount to Stripe minor units (e.g. dollars -> cents)."""
    major = Decimal(str(amount))
    return int((major * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _create_stripe_payment_intent(payment: Payment) -> tuple[str, Optional[str]]:
    """
    Create a real Stripe PaymentIntent and return (id, client_secret).

    Idempotency is handled by passing a deterministic key to Stripe.
    """
    secret_key = get_stripe_secret_key()
    if not secret_key:
        raise PaymentServiceError(
            PaymentErrorCode.PAYMENT_PROVIDER_ERROR,
            "Stripe is not configured: STRIPE_SECRET_KEY is missing",
            http_status=500,
        )

    stripe.api_key = secret_key
    amount_minor = _amount_to_minor_units(float(payment.price))
    if amount_minor <= 0:
        raise PaymentServiceError(
            PaymentErrorCode.VALIDATION_ERROR,
            "Payment amount must be greater than zero",
            http_status=400,
            details={"payment_id": payment.payment_id, "amount_minor": amount_minor},
        )

    stripe_idempotency_key = (
        f"checkout:{payment.tenant_id}:{payment.payment_type.value}:"
        f"{payment.reference_id}:{payment.idempotency_key}"
    )

    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_minor,
            currency=get_stripe_currency(),
            automatic_payment_methods={"enabled": True},
            metadata={
                "payment_id": str(payment.payment_id),
                "tenant_id": str(payment.tenant_id),
                "payment_type": payment.payment_type.value,
                "reference_id": str(payment.reference_id or ""),
            },
            idempotency_key=stripe_idempotency_key,
        )
    except stripe.error.StripeError as exc:
        raise PaymentServiceError(
            PaymentErrorCode.PAYMENT_PROVIDER_ERROR,
            "Failed to create Stripe PaymentIntent",
            http_status=502,
            details={"stripe_error": str(exc)},
        ) from exc

    intent_id = intent.get("id")
    if not intent_id:
        raise PaymentServiceError(
            PaymentErrorCode.PAYMENT_PROVIDER_ERROR,
            "Stripe PaymentIntent response did not include an id",
            http_status=502,
        )
    return str(intent_id), intent.get("client_secret")


def _get_stripe_payment_intent_client_secret(intent_id: str) -> Optional[str]:
    """Fetch client_secret for an existing Stripe PaymentIntent."""
    secret_key = get_stripe_secret_key()
    if not secret_key:
        raise PaymentServiceError(
            PaymentErrorCode.PAYMENT_PROVIDER_ERROR,
            "Stripe is not configured: STRIPE_SECRET_KEY is missing",
            http_status=500,
        )

    try:
        stripe.api_key = secret_key
        intent = stripe.PaymentIntent.retrieve(intent_id)
    except stripe.error.StripeError as exc:
        raise PaymentServiceError(
            PaymentErrorCode.PAYMENT_PROVIDER_ERROR,
            "Failed to retrieve Stripe PaymentIntent",
            http_status=502,
            details={"stripe_error": str(exc), "stripe_payment_intent_id": intent_id},
        ) from exc

    if not intent:
        return None
    return intent.get("client_secret")


def _retrieve_stripe_payment_intent(intent_id: str) -> dict:
    secret_key = get_stripe_secret_key()
    if not secret_key:
        raise PaymentServiceError(
            PaymentErrorCode.PAYMENT_PROVIDER_ERROR,
            "Stripe is not configured: STRIPE_SECRET_KEY is missing",
            http_status=500,
        )

    try:
        stripe.api_key = secret_key
        intent = stripe.PaymentIntent.retrieve(intent_id)
    except stripe.error.StripeError as exc:
        raise PaymentServiceError(
            PaymentErrorCode.PAYMENT_PROVIDER_ERROR,
            "Failed to retrieve Stripe PaymentIntent",
            http_status=502,
            details={"stripe_error": str(exc), "stripe_payment_intent_id": intent_id},
        ) from exc

    return dict(intent or {})


def _activate_order_if_applicable(db: Session, order_id: int) -> None:
    order = db.get(Order, order_id)
    if order is None:
        return
    if order.status == OrderStatus.PENDING:
        order.status = OrderStatus.PAID


def _activate_enrollment_if_applicable(db: Session, enrollment_id: int) -> None:
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        return

    now = datetime.now(timezone.utc)
    enrollment.status = EnrollmentStatus.ACTIVE
    enrollment.cancelled_at = None
    if enrollment.activated_at is None:
        enrollment.activated_at = now
    if enrollment.expires_at is None:
        plan = db.get(UserTenantPlan, enrollment.user_tenant_plan_id)
        if plan is not None and plan.duration:
            enrollment.expires_at = now + timedelta(days=int(plan.duration))


def _activate_tenant_subscription_if_applicable(db: Session, tenant_subscription_id: int) -> None:
    subscription = db.get(TenantSubscription, tenant_subscription_id)
    if subscription is None:
        return

    now = datetime.now(timezone.utc)
    replacement_plan = db.get(SubscriptionPlan, subscription.subscription_plan_id)

    active_subscriptions = (
        db.query(TenantSubscription)
        .filter(
            TenantSubscription.tenant_id == subscription.tenant_id,
            TenantSubscription.id != subscription.id,
            TenantSubscription.status == SubscriptionStatus.ACTIVE,
        )
        .all()
    )
    for active_subscription in active_subscriptions:
        active_subscription.status = SubscriptionStatus.EXPIRED
        active_subscription.cancelled_at = now
        active_subscription.cancellation_reason = (
            f"Replaced with {replacement_plan.name}"
            if replacement_plan is not None
            else "Replaced after successful payment"
        )

    subscription.status = SubscriptionStatus.ACTIVE
    subscription.cancelled_at = None
    subscription.cancellation_reason = None
    if subscription.activated_at is None:
        subscription.activated_at = now
    if subscription.expires_at is None:
        if replacement_plan is not None and replacement_plan.duration:
            subscription.expires_at = now + timedelta(days=int(replacement_plan.duration))


def _apply_post_payment_activation(db: Session, payment: Payment) -> None:
    if payment.reference_id is None:
        return

    if payment.payment_type == PaymentType.ORDER:
        _activate_order_if_applicable(db, payment.reference_id)
    elif payment.payment_type == PaymentType.ENROLLMENT:
        _activate_enrollment_if_applicable(db, payment.reference_id)
    elif payment.payment_type == PaymentType.TENANT_SUBSCRIPTION:
        _activate_tenant_subscription_if_applicable(db, payment.reference_id)


def _is_post_payment_activation_complete(db: Session, payment: Payment) -> bool:
    if payment.reference_id is None:
        return True

    if payment.payment_type == PaymentType.ORDER:
        order = db.get(Order, payment.reference_id)
        return bool(order and order.status == OrderStatus.PAID)

    if payment.payment_type == PaymentType.ENROLLMENT:
        enrollment = db.get(Enrollment, payment.reference_id)
        return bool(
            enrollment
            and enrollment.status == EnrollmentStatus.ACTIVE
            and enrollment.activated_at is not None
        )

    if payment.payment_type == PaymentType.TENANT_SUBSCRIPTION:
        subscription = db.get(TenantSubscription, payment.reference_id)
        return bool(
            subscription
            and subscription.status == SubscriptionStatus.ACTIVE
            and subscription.activated_at is not None
        )

    return True


def _append_payment_audit_note(payment: Payment, message: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    note = f"[{timestamp}] {message}"
    payment.audit_notes = f"{payment.audit_notes}\n{note}" if payment.audit_notes else note


def _can_transition_payment(current: PaymentStatus, target: PaymentStatus) -> bool:
    if current == target:
        return True
    return target in ALLOWED_PAYMENT_TRANSITIONS.get(current, set())


def _resolve_payment_intent_id(event_type: str, obj: dict) -> str | None:
    if event_type.startswith("charge."):
        return obj.get("payment_intent")
    return obj.get("id")


def _mark_payment_as_captured(db: Session, payment: Payment) -> Payment:
    if payment.status == PaymentStatus.CAPTURED and _is_post_payment_activation_complete(
        db, payment
    ):
        return payment

    payment.status = PaymentStatus.CAPTURED
    payment.last_error = None
    _apply_post_payment_activation(db, payment)
    db.commit()
    db.refresh(payment)

    if payment.payment_type == PaymentType.TENANT_SUBSCRIPTION and payment.reference_id is not None:
        subscription = db.get(TenantSubscription, payment.reference_id)
        if subscription is not None:
            try:
                asyncio.get_running_loop().create_task(
                    subscription_request_stream.publish_subscription_ready(
                        subscription_id=subscription.id,
                        tenant_id=subscription.tenant_id,
                    )
                )
            except RuntimeError:
                asyncio.run(
                    subscription_request_stream.publish_subscription_ready(
                        subscription_id=subscription.id,
                        tenant_id=subscription.tenant_id,
                    )
                )

    return payment


def _cancel_pending_enrollment_for_failed_payment(db: Session, payment: Payment) -> None:
    if payment.payment_type != PaymentType.ENROLLMENT or payment.reference_id is None:
        return

    enrollment = db.get(Enrollment, payment.reference_id)
    if enrollment is None or enrollment.status != EnrollmentStatus.PENDING:
        return

    enrollment.status = EnrollmentStatus.CANCELLED
    enrollment.cancelled_at = datetime.now(timezone.utc)


def _mark_payment_as_failed(
    db: Session,
    payment: Payment,
    *,
    last_error: str | None = None,
    commit: bool = True,
) -> Payment:
    """Set payment status to FAILED and cancel any pending enrollment tied to it."""
    if payment.status == PaymentStatus.CAPTURED:
        return payment

    payment.status = PaymentStatus.FAILED
    if last_error is not None:
        payment.last_error = last_error

    _cancel_pending_enrollment_for_failed_payment(db, payment)

    if commit:
        db.commit()
        db.refresh(payment)
    return payment


def sync_payment_status_with_provider(db: Session, payment_id: int) -> Payment:
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise PaymentServiceError(
            PaymentErrorCode.NOT_FOUND,
            "Payment not found",
            http_status=404,
            details={"payment_id": payment_id},
        )

    if not payment.stripe_payment_intent_id:
        raise PaymentServiceError(
            PaymentErrorCode.CONFLICT,
            "Payment has no Stripe PaymentIntent to sync",
            http_status=409,
            details={"payment_id": payment_id},
        )

    intent = _retrieve_stripe_payment_intent(payment.stripe_payment_intent_id)
    intent_status = str(intent.get("status") or "").strip().lower()

    if intent_status == "succeeded":
        return _mark_payment_as_captured(db, payment)

    if intent_status in {"processing", "requires_capture"}:
        payment.status = PaymentStatus.AUTHORIZED
        payment.last_error = None
    elif intent_status == "canceled":
        payment.status = PaymentStatus.CANCELED
        payment.last_error = "Stripe PaymentIntent was canceled"
    elif intent_status == "requires_payment_method":
        payment = _mark_payment_as_failed(
            db,
            payment,
            last_error="Stripe PaymentIntent still requires a payment method",
            commit=False,
        )
    elif intent_status in {"requires_action", "requires_confirmation"}:
        payment.status = PaymentStatus.REQUIRES_MANUAL_INTERVENTION
        payment.last_error = f"Stripe PaymentIntent requires manual action ({intent_status})"

    _append_payment_audit_note(
        payment,
        f"Synced payment status from Stripe PaymentIntent {payment.stripe_payment_intent_id}: {intent_status or 'unknown'} -> {payment.status.value}",
    )
    db.commit()
    db.refresh(payment)
    return payment


def _verify_stripe_webhook_event(payload: bytes, signature: str | None) -> dict:
    webhook_secret = get_stripe_webhook_secret()
    if not webhook_secret:
        raise PaymentServiceError(
            PaymentErrorCode.PAYMENT_PROVIDER_ERROR,
            "Stripe webhook is not configured: STRIPE_WEBHOOK_SECRET is missing",
            http_status=500,
        )
    if not signature:
        raise PaymentServiceError(
            PaymentErrorCode.VALIDATION_ERROR,
            "Missing Stripe-Signature header",
            http_status=400,
        )

    try:
        stripe.api_key = get_stripe_secret_key()
        event = stripe.Webhook.construct_event(payload, signature, webhook_secret)
    except ValueError as exc:
        raise PaymentServiceError(
            PaymentErrorCode.VALIDATION_ERROR,
            "Invalid Stripe webhook payload",
            http_status=400,
        ) from exc
    except stripe.error.SignatureVerificationError as exc:
        raise PaymentServiceError(
            PaymentErrorCode.FORBIDDEN,
            "Invalid Stripe webhook signature",
            http_status=400,
        ) from exc

    return dict(event)


def _suspend_entities_for_dispute(db: Session, payment: Payment) -> None:
    if payment.reference_id is None:
        return

    now = datetime.now(timezone.utc)
    if payment.payment_type == PaymentType.ENROLLMENT:
        enrollment = db.get(Enrollment, payment.reference_id)
        if enrollment and enrollment.status == EnrollmentStatus.ACTIVE:
            enrollment.status = EnrollmentStatus.CANCELLED
            enrollment.cancelled_at = now
    elif payment.payment_type == PaymentType.TENANT_SUBSCRIPTION:
        subscription = db.get(TenantSubscription, payment.reference_id)
        if subscription and subscription.status == SubscriptionStatus.ACTIVE:
            subscription.status = SubscriptionStatus.EXPIRED
            subscription.cancelled_at = now
            subscription.cancellation_reason = f"Payment Disputed: {payment.payment_id}"


def _apply_webhook_state_transition(
    db: Session,
    payment: Payment,
    *,
    event_type: str,
    event_id: str,
    obj: dict,
) -> dict:
    target_status = WEBHOOK_EVENT_STATUS_MAP.get(event_type)
    if target_status is None:
        _append_payment_audit_note(
            payment, f"Ignored unsupported webhook event {event_id} ({event_type})"
        )
        db.commit()
        return {"processed": False, "reason": "event_ignored", "event_type": event_type}

    if payment.external_event_id == event_id:
        return {"processed": True, "reason": "already_processed", "event_type": event_type}

    current_status = payment.status
    if not _can_transition_payment(current_status, target_status):
        _append_payment_audit_note(
            payment,
            (
                f"Ignored out-of-order webhook event {event_id} ({event_type}) "
                f"while payment remained {current_status.value}"
            ),
        )
        db.commit()
        return {"processed": False, "reason": "transition_ignored", "event_type": event_type}

    if current_status == target_status:
        payment.external_event_id = event_id
        _append_payment_audit_note(
            payment,
            f"Deduplicated webhook event {event_id} ({event_type}) with no state change",
        )
        db.commit()
        return {"processed": True, "reason": "already_in_state", "event_type": event_type}

    failure_message = str(
        obj.get("last_payment_error", {}).get("message")
        or obj.get("cancellation_reason")
        or f"Stripe webhook moved payment to {target_status.value}"
    )

    if target_status == PaymentStatus.CAPTURED:
        payment = _mark_payment_as_captured(db, payment)
    elif target_status == PaymentStatus.FAILED:
        payment = _mark_payment_as_failed(
            db,
            payment,
            last_error=failure_message,
            commit=False,
        )
    elif target_status == PaymentStatus.DISPUTED:
        payment.status = PaymentStatus.DISPUTED
        payment.last_error = "Stripe dispute opened against captured payment"
        _suspend_entities_for_dispute(db, payment)
    else:
        payment.status = target_status
        payment.last_error = failure_message

    payment.external_event_id = event_id
    _append_payment_audit_note(
        payment,
        f"Applied webhook event {event_id} ({event_type}) -> {payment.status.value}",
    )
    db.commit()
    db.refresh(payment)
    return {
        "processed": True,
        "event_type": event_type,
        "payment_id": payment.payment_id,
        "payment_status": payment.status.value,
    }


def process_stripe_webhook(db: Session, payload: bytes, signature: str | None) -> dict:
    """
    Process Stripe webhook event payload and perform post-payment activation, failure, or suspension.
    """
    event = _verify_stripe_webhook_event(payload, signature)
    event_type = str(event.get("type") or "")
    event_id = str(event.get("id") or "")
    data = event.get("data") or {}
    obj = data.get("object") or {}
    if not event_id:
        return {"processed": False, "reason": "missing_event_id", "event_type": event_type}

    intent_id = _resolve_payment_intent_id(event_type, obj)

    if not intent_id:
        if event_type == "payment_intent.succeeded":
            raise PaymentServiceError(
                PaymentErrorCode.VALIDATION_ERROR,
                "payment_intent.succeeded missing PaymentIntent id",
                http_status=400,
            )
        return {"processed": False, "reason": "missing_intent_id", "event_type": event_type}

    payment = (
        db.query(Payment)
        .filter(Payment.stripe_payment_intent_id == str(intent_id))
        .order_by(Payment.payment_id.desc())
        .first()
    )
    if payment is None:
        return {"processed": False, "reason": "payment_not_found", "event_type": event_type}

    try:
        return _apply_webhook_state_transition(
            db,
            payment,
            event_type=event_type,
            event_id=event_id,
            obj=obj,
        )
    except Exception:
        db.rollback()
        raise


def _create_or_get_payment_record(
    db: Session,
    *,
    tenant_id: int,
    payment_type: PaymentType,
    reference_id: int,
    reference_type: str,
    amount: float,
    idempotency_key: str,
) -> tuple[Payment, Optional[str]]:
    # Idempotency: return existing payment if one exists for this key
    existing = (
        db.query(Payment)
        .filter(
            Payment.tenant_id == tenant_id,
            Payment.payment_type == payment_type,
            Payment.reference_id == reference_id,
            Payment.idempotency_key == idempotency_key,
        )
        .first()
    )
    if existing is not None:
        if not existing.stripe_payment_intent_id:
            intent_id, client_secret = _create_stripe_payment_intent(existing)
            existing.stripe_payment_intent_id = intent_id
            db.commit()
            db.refresh(existing)
            return existing, client_secret
        return existing, _get_stripe_payment_intent_client_secret(existing.stripe_payment_intent_id)

    # Create new payment (concurrency-safe: on unique violation, fetch and return existing)
    try:
        payment = Payment(
            payment_type=payment_type,
            price=amount,
            tenant_id=tenant_id,
            reference_id=reference_id,
            reference_type=reference_type,
            idempotency_key=idempotency_key,
            status=PaymentStatus.INITIATED,
        )
        db.add(payment)
        db.flush()
        intent_id, client_secret = _create_stripe_payment_intent(payment)
        payment.stripe_payment_intent_id = intent_id
        db.commit()
        db.refresh(payment)
        return payment, client_secret
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(Payment)
            .filter(
                Payment.tenant_id == tenant_id,
                Payment.payment_type == payment_type,
                Payment.reference_id == reference_id,
                Payment.idempotency_key == idempotency_key,
            )
            .first()
        )
        if existing is not None:
            if not existing.stripe_payment_intent_id:
                intent_id, client_secret = _create_stripe_payment_intent(existing)
                existing.stripe_payment_intent_id = intent_id
                db.commit()
                db.refresh(existing)
                return existing, client_secret
            return existing, _get_stripe_payment_intent_client_secret(
                existing.stripe_payment_intent_id
            )
        raise
    except PaymentServiceError:
        db.rollback()
        raise


def create_or_get_order_payment(
    db: Session,
    order_id: int,
    user_id: int,
    idempotency_key: str,
) -> tuple[Payment, Optional[str]]:
    """
    Create or return existing Payment for an Order, with idempotency.

    Validates:
    - Order exists and belongs to authenticated patient (patient_user_id).
    - Order.status is PENDING.
    - Order.total_amount > 0 (amount derived from DB).

    Tenant is derived from the order (order.tenant_id). If a Payment already exists
    for (tenant_id, ORDER, order_id, idempotency_key), returns it without creating
    a new row. Otherwise creates a new Payment with status INITIATED.

    Returns:
        tuple[Payment, Optional[str]]: (payment, stripe_client_secret)

    Raises:
        PaymentServiceError: NOT_FOUND (404), FORBIDDEN (403), CONFLICT (409), VALIDATION_ERROR (400).
    """
    order = db.get(Order, order_id)
    if order is None:
        raise PaymentServiceError(
            PaymentErrorCode.NOT_FOUND,
            "Order not found",
            http_status=404,
            details={"order_id": order_id},
        )

    if order.patient_user_id != user_id:
        raise PaymentServiceError(
            PaymentErrorCode.FORBIDDEN,
            "Order does not belong to the authenticated user",
            http_status=403,
            details={"order_id": order_id},
        )

    if order.status != OrderStatus.PENDING:
        raise PaymentServiceError(
            PaymentErrorCode.CONFLICT,
            f"Order is not PENDING (current status: {order.status.value}); cannot initiate checkout",
            http_status=409,
            details={"order_id": order_id, "order_status": order.status.value},
        )

    amount = float(order.total_amount)
    if amount <= 0:
        raise PaymentServiceError(
            PaymentErrorCode.VALIDATION_ERROR,
            "Order total amount must be greater than zero",
            http_status=400,
            details={"order_id": order_id, "total_amount": amount},
        )

    tenant_id = order.tenant_id

    return _create_or_get_payment_record(
        db,
        tenant_id=tenant_id,
        payment_type=PaymentType.ORDER,
        reference_id=order_id,
        reference_type="order",
        amount=amount,
        idempotency_key=idempotency_key,
    )


def create_or_get_enrollment_payment(
    db: Session,
    enrollment_id: int,
    user_id: int,
    idempotency_key: str,
) -> tuple[Payment, Optional[str]]:
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise PaymentServiceError(
            PaymentErrorCode.NOT_FOUND,
            "Enrollment not found",
            http_status=404,
            details={"enrollment_id": enrollment_id},
        )

    if enrollment.patient_user_id != user_id:
        raise PaymentServiceError(
            PaymentErrorCode.FORBIDDEN,
            "Enrollment does not belong to the authenticated user",
            http_status=403,
            details={"enrollment_id": enrollment_id},
        )

    if enrollment.status != EnrollmentStatus.PENDING:
        raise PaymentServiceError(
            PaymentErrorCode.CONFLICT,
            f"Enrollment is not PENDING (current status: {enrollment.status.value}); cannot initiate checkout",
            http_status=409,
            details={"enrollment_id": enrollment_id, "enrollment_status": enrollment.status.value},
        )

    plan = db.get(UserTenantPlan, enrollment.user_tenant_plan_id)
    if plan is None:
        raise PaymentServiceError(
            PaymentErrorCode.NOT_FOUND,
            "Enrollment plan not found",
            http_status=404,
            details={
                "enrollment_id": enrollment_id,
                "user_tenant_plan_id": enrollment.user_tenant_plan_id,
            },
        )

    amount = float(plan.price)
    if amount <= 0:
        raise PaymentServiceError(
            PaymentErrorCode.VALIDATION_ERROR,
            "Enrollment plan amount must be greater than zero",
            http_status=400,
            details={
                "enrollment_id": enrollment_id,
                "user_tenant_plan_id": enrollment.user_tenant_plan_id,
                "plan_price": amount,
            },
        )

    return _create_or_get_payment_record(
        db,
        tenant_id=enrollment.tenant_id,
        payment_type=PaymentType.ENROLLMENT,
        reference_id=enrollment_id,
        reference_type="enrollment",
        amount=amount,
        idempotency_key=idempotency_key,
    )


def create_or_get_tenant_subscription_payment(
    db: Session,
    tenant_subscription_id: int,
    user_id: int,
    idempotency_key: str,
) -> tuple[Payment, Optional[str]]:
    tenant_subscription = db.get(TenantSubscription, tenant_subscription_id)
    if tenant_subscription is None:
        raise PaymentServiceError(
            PaymentErrorCode.NOT_FOUND,
            "Tenant subscription not found",
            http_status=404,
            details={"tenant_subscription_id": tenant_subscription_id},
        )

    manager = (
        db.query(TenantManager)
        .filter(
            TenantManager.user_id == user_id,
            TenantManager.tenant_id == tenant_subscription.tenant_id,
        )
        .first()
    )
    if manager is None:
        raise PaymentServiceError(
            PaymentErrorCode.FORBIDDEN,
            "Tenant subscription does not belong to the authenticated tenant manager",
            http_status=403,
            details={"tenant_subscription_id": tenant_subscription_id},
        )

    if tenant_subscription.status == SubscriptionStatus.ACTIVE:
        raise PaymentServiceError(
            PaymentErrorCode.CONFLICT,
            "Tenant subscription is already ACTIVE; cannot initiate checkout",
            http_status=409,
            details={
                "tenant_subscription_id": tenant_subscription_id,
                "subscription_status": tenant_subscription.status.value,
            },
        )

    if tenant_subscription.cancelled_at is not None:
        raise PaymentServiceError(
            PaymentErrorCode.CONFLICT,
            "Cancelled tenant subscription request cannot initiate checkout",
            http_status=409,
            details={
                "tenant_subscription_id": tenant_subscription_id,
                "subscription_status": tenant_subscription.status.value,
            },
        )

    allowed_statuses = {SubscriptionStatus.EXPIRED}
    if tenant_subscription.status not in allowed_statuses:
        allowed_status_values = [
            status.value for status in sorted(allowed_statuses, key=lambda s: s.value)
        ]
        raise PaymentServiceError(
            PaymentErrorCode.CONFLICT,
            (
                "Tenant subscription status does not allow checkout initiation "
                f"(current status: {tenant_subscription.status.value}; allowed: {allowed_status_values})"
            ),
            http_status=409,
            details={
                "tenant_subscription_id": tenant_subscription_id,
                "subscription_status": tenant_subscription.status.value,
                "allowed_statuses": allowed_status_values,
            },
        )

    plan = db.get(SubscriptionPlan, tenant_subscription.subscription_plan_id)
    if plan is None:
        raise PaymentServiceError(
            PaymentErrorCode.NOT_FOUND,
            "Subscription plan not found",
            http_status=404,
            details={
                "tenant_subscription_id": tenant_subscription_id,
                "subscription_plan_id": tenant_subscription.subscription_plan_id,
            },
        )

    amount = float(plan.price)
    if amount <= 0:
        raise PaymentServiceError(
            PaymentErrorCode.VALIDATION_ERROR,
            "Subscription plan amount must be greater than zero",
            http_status=400,
            details={
                "tenant_subscription_id": tenant_subscription_id,
                "subscription_plan_id": tenant_subscription.subscription_plan_id,
                "plan_price": amount,
            },
        )

    return _create_or_get_payment_record(
        db,
        tenant_id=tenant_subscription.tenant_id,
        payment_type=PaymentType.TENANT_SUBSCRIPTION,
        reference_id=tenant_subscription_id,
        reference_type="tenant_subscription",
        amount=amount,
        idempotency_key=idempotency_key,
    )
