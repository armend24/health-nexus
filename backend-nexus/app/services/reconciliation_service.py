from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import Dict

import stripe
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import get_stripe_secret_key
from app.models.payment import Payment, PaymentStatus
from app.services.payment_service import (
    _append_payment_audit_note,
    _is_post_payment_activation_complete,
    _mark_payment_as_captured,
    _mark_payment_as_failed,
)

logger = logging.getLogger(__name__)

PENDING_RECONCILIATION_STATUSES = {
    PaymentStatus.INITIATED,
    PaymentStatus.AUTHORIZED,
}
PENDING_STRIPE_STATUSES = {
    "processing",
    "requires_action",
    "requires_confirmation",
    "requires_capture",
}
FAILED_STRIPE_STATUSES = {
    "requires_payment_method",
}


def _activation_complete(db: Session, payment: Payment) -> bool:
    return _is_post_payment_activation_complete(db, payment)


def _mark_manual_intervention(payment: Payment, reason: str) -> None:
    payment.status = PaymentStatus.REQUIRES_MANUAL_INTERVENTION
    payment.last_error = reason
    _append_payment_audit_note(
        payment, f"Reconciliation escalated payment to manual intervention: {reason}"
    )


def _process_pending_payment(
    db: Session,
    payment: Payment,
    stripe_status: str | None,
    *,
    hard_stale_threshold: datetime,
    stats: Dict[str, int],
) -> None:
    if stripe_status == "succeeded":
        _mark_payment_as_captured(db, payment)
        payment.last_error = None
        _append_payment_audit_note(payment, "Recovered captured payment via reconciliation sweep")
        stats["recovered"] += 1
        return

    if stripe_status == "canceled":
        payment.status = PaymentStatus.CANCELED
        payment.last_error = "Reconciled canceled payment from Stripe"
        _append_payment_audit_note(
            payment, "Reconciliation marked payment as CANCELED from Stripe status canceled"
        )
        return

    if stripe_status in FAILED_STRIPE_STATUSES:
        _mark_payment_as_failed(
            db,
            payment,
            last_error=f"Reconciled failed payment from Stripe status {stripe_status}",
            commit=False,
        )
        _append_payment_audit_note(
            payment, f"Reconciliation marked payment as FAILED from Stripe status {stripe_status}"
        )
        return

    if stripe_status in PENDING_STRIPE_STATUSES:
        if payment.created_at < hard_stale_threshold:
            _mark_manual_intervention(
                payment,
                f"Stripe intent remained pending too long ({stripe_status})",
            )
            stats["manual_intervention"] += 1
        else:
            _append_payment_audit_note(
                payment,
                f"Stripe intent still pending with status {stripe_status}; no change applied",
            )
            stats["ignored_pending"] += 1
        return

    _mark_manual_intervention(
        payment,
        f"Unknown Stripe status during reconciliation: {stripe_status}",
    )
    stats["manual_intervention"] += 1


def _process_captured_payment(
    db: Session,
    payment: Payment,
    stripe_status: str | None,
    *,
    stats: Dict[str, int],
) -> None:
    if stripe_status == "succeeded":
        if not _activation_complete(db, payment):
            _mark_payment_as_captured(db, payment)
            _append_payment_audit_note(
                payment, "Re-applied post-payment activation during reconciliation"
            )
            stats["recovered"] += 1
        else:
            _append_payment_audit_note(
                payment, "Reconciliation confirmed captured payment side effects already complete"
            )
        return

    _mark_manual_intervention(
        payment,
        f"Conflict detected: internal payment is CAPTURED but Stripe status is {stripe_status}",
    )
    stats["conflicts"] += 1
    stats["manual_intervention"] += 1


def reconcile_payments(
    db: Session,
    *,
    max_records: int = 50,
    pending_age_minutes: int = 15,
    stale_pending_hours: int = 24,
    max_retries: int = 5,
) -> Dict[str, int]:
    stripe.api_key = get_stripe_secret_key()
    pending_threshold = datetime.now(timezone.utc) - timedelta(minutes=pending_age_minutes)
    hard_stale_threshold = datetime.now(timezone.utc) - timedelta(hours=stale_pending_hours)

    candidates = (
        db.query(Payment)
        .filter(
            or_(
                Payment.status.in_(tuple(PENDING_RECONCILIATION_STATUSES)),
                Payment.status == PaymentStatus.CAPTURED,
            )
        )
        .filter(Payment.retry_count < max_retries)
        .with_for_update(skip_locked=True)
        .limit(max_records)
        .all()
    )

    stats = {
        "processed": 0,
        "recovered": 0,
        "manual_intervention": 0,
        "ignored_pending": 0,
        "conflicts": 0,
        "failures": 0,
    }

    for payment in candidates:
        needs_processing = (
            payment.status in PENDING_RECONCILIATION_STATUSES
            and payment.created_at < pending_threshold
        ) or (payment.status == PaymentStatus.CAPTURED and not _activation_complete(db, payment))
        if not needs_processing:
            continue

        stats["processed"] += 1
        try:
            if not payment.stripe_payment_intent_id:
                raise ValueError("Missing stripe_payment_intent_id")

            intent = stripe.PaymentIntent.retrieve(payment.stripe_payment_intent_id)
            stripe_status = intent.get("status")
            _append_payment_audit_note(
                payment, f"Reconciliation observed Stripe status {stripe_status}"
            )

            if payment.status in PENDING_RECONCILIATION_STATUSES:
                _process_pending_payment(
                    db,
                    payment,
                    stripe_status,
                    hard_stale_threshold=hard_stale_threshold,
                    stats=stats,
                )
            elif payment.status == PaymentStatus.CAPTURED:
                _process_captured_payment(
                    db,
                    payment,
                    stripe_status,
                    stats=stats,
                )

            db.commit()
        except Exception as exc:
            db.rollback()
            locked_payment = (
                db.query(Payment)
                .filter(Payment.payment_id == payment.payment_id)
                .with_for_update(skip_locked=True)
                .first()
            )
            if locked_payment is None:
                continue

            locked_payment.retry_count += 1
            locked_payment.last_error = str(exc)
            _append_payment_audit_note(
                locked_payment,
                f"Reconciliation attempt failed (retry_count={locked_payment.retry_count}): {exc}",
            )
            if locked_payment.retry_count >= max_retries:
                _mark_manual_intervention(locked_payment, str(exc))
                stats["manual_intervention"] += 1

            db.commit()
            stats["failures"] += 1
            logger.warning(
                "Payment reconciliation failed",
                extra={"payment_id": payment.payment_id, "error": str(exc)},
            )

    return stats


def reconcile_stale_payments(db: Session, max_records: int = 50) -> Dict[str, int]:
    return reconcile_payments(db, max_records=max_records)
