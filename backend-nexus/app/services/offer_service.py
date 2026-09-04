import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.appointment import Appointment, AppointmentStatus
from app.models.notification import NotificationType
from app.models.offer_acceptance import OfferAcceptance
from app.models.offer_delivery import (
    OfferDelivery,
    OfferDeliveryChannel,
    OfferDeliveryStatus,
)
from app.models.recommendation import Recommendation
from app.services.feature_flag_engine import resolve_flag
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)

POST_APPOINTMENT_OFFERS_FLAG = "post_appointment_offers"
APPROVED_RECOMMENDATION_CATEGORIES = {
    "FOLLOW_UP",
    "CARE_PLAN",
    "LAB_TEST",
    "THERAPY",
    "WELLNESS",
    "SUPPLEMENT",
}


@dataclass
class OfferEligibilityResult:
    """
    Result of eligibility check for generating post-appointment offers.
    - eligible: Whether the appointment qualifies for offers.
    - recommendations: List of approved recommendations for the appointment.
    - reason: Reason for ineligibility, if any.
    """
    eligible: bool
    recommendations: list[Recommendation]
    reason: str | None = None


@dataclass
class OfferGenerationResult:
    """
    Result of generating offers for an appointment.
    - appointment_id: ID of the appointment.
    - eligible: Whether offers were eligible to be generated.
    - created: List of newly created OfferDelivery objects.
    - existing: List of already existing OfferDelivery objects.
    - skipped_count: Number of recommendations skipped (already delivered).
    - reason: Reason for not generating offers, if any.
    """
    appointment_id: int
    eligible: bool
    created: list[OfferDelivery]
    existing: list[OfferDelivery]
    skipped_count: int
    reason: str | None = None


def get_offer_by_id(db: Session, offer_id: int) -> OfferDelivery | None:
    """
    Retrieve an OfferDelivery by its ID, including related recommendation and acceptance.
    """
    return (
        db.query(OfferDelivery)
        .options(
            joinedload(OfferDelivery.recommendation),
            joinedload(OfferDelivery.acceptance),
        )
        .filter(OfferDelivery.id == offer_id)
        .first()
    )


def evaluate_offer_eligibility(db: Session, appointment: Appointment) -> OfferEligibilityResult:
    """
    Check if an appointment is eligible for post-appointment offers.
    Eligibility requires:
      - Appointment is COMPLETED
      - Feature flag is enabled for tenant
      - There are approved recommendations in allowed categories
    Returns OfferEligibilityResult with eligibility, recommendations, and reason.
    """
    if appointment.status != AppointmentStatus.COMPLETED:
        logger.info(
            "offers.eligibility_denied appointment_id=%s tenant_id=%s reason=appointment_not_completed",
            appointment.id,
            appointment.tenant_id,
        )
        return OfferEligibilityResult(
            eligible=False,
            recommendations=[],
            reason="appointment_not_completed",
        )

    if not resolve_flag(db, appointment.tenant_id, POST_APPOINTMENT_OFFERS_FLAG):
        logger.info(
            "offers.eligibility_denied appointment_id=%s tenant_id=%s reason=feature_flag_disabled",
            appointment.id,
            appointment.tenant_id,
        )
        return OfferEligibilityResult(
            eligible=False,
            recommendations=[],
            reason="feature_flag_disabled",
        )

    recommendations = (
        db.query(Recommendation)
        .filter(
            Recommendation.appointment_id == appointment.id,
            Recommendation.doctor_id == appointment.doctor_user_id,
            Recommendation.client_id == appointment.patient_user_id,
            Recommendation.approved == True,
            Recommendation.category.in_(sorted(APPROVED_RECOMMENDATION_CATEGORIES)),
        )
        .order_by(Recommendation.created_at.asc(), Recommendation.id.asc())
        .all()
    )

    if not recommendations:
        logger.info(
            "offers.eligibility_denied appointment_id=%s tenant_id=%s reason=no_approved_recommendations",
            appointment.id,
            appointment.tenant_id,
        )
        return OfferEligibilityResult(
            eligible=False,
            recommendations=[],
            reason="no_approved_recommendations",
        )

    logger.info(
        "offers.eligibility_passed appointment_id=%s tenant_id=%s recommendations=%s",
        appointment.id,
        appointment.tenant_id,
        len(recommendations),
    )
    return OfferEligibilityResult(eligible=True, recommendations=recommendations)


def generate_offers_for_appointment(
    db: Session,
    *,
    appointment: Appointment,
    delivery_channel: OfferDeliveryChannel = OfferDeliveryChannel.IN_APP,
    expires_in_days: int = 14,
) -> OfferGenerationResult:
    """
    Generate post-appointment offers for a given appointment.
    - Checks eligibility.
    - Creates OfferDelivery objects for approved recommendations.
    - Sends notifications for new offers.
    - Returns OfferGenerationResult with created, existing, and skipped offers.
    """
    eligibility = evaluate_offer_eligibility(db, appointment)
    if not eligibility.eligible:
        return OfferGenerationResult(
            appointment_id=appointment.id,
            eligible=False,
            created=[],
            existing=[],
            skipped_count=0,
            reason=eligibility.reason,
        )

    created: list[OfferDelivery] = []
    existing: list[OfferDelivery] = []
    expires_at = datetime.now(timezone.utc) + timedelta(days=max(1, expires_in_days))

    for recommendation in eligibility.recommendations:
        existing_offer = (
            db.query(OfferDelivery)
            .filter(
                OfferDelivery.recommendation_id == recommendation.id,
                OfferDelivery.client_id == recommendation.client_id,
            )
            .first()
        )
        if existing_offer:
            existing.append(existing_offer)
            continue

        offer = OfferDelivery(
            recommendation_id=recommendation.id,
            client_id=recommendation.client_id,
            offer_status=OfferDeliveryStatus.DELIVERED,
            delivery_channel=delivery_channel,
            sent_at=datetime.now(timezone.utc),
            expires_at=expires_at,
        )
        db.add(offer)
        db.flush()

        create_notification(
            db,
            user_id=recommendation.client_id,
            tenant_id=appointment.tenant_id,
            notification_type=NotificationType.OFFER_DELIVERED,
            title="New care offer available",
            message=(
                f"A post-appointment offer for {recommendation.recommendation_type} is ready."
            ),
            entity_type="offer_delivery",
            entity_id=offer.id,
        )
        created.append(offer)

    logger.info(
        "offers.generated appointment_id=%s tenant_id=%s created=%s existing=%s skipped=%s",
        appointment.id,
        appointment.tenant_id,
        len(created),
        len(existing),
        len(eligibility.recommendations) - len(created) - len(existing),
    )

    return OfferGenerationResult(
        appointment_id=appointment.id,
        eligible=True,
        created=created,
        existing=existing,
        skipped_count=len(eligibility.recommendations) - len(created) - len(existing),
    )


def on_appointment_completed(db: Session, appointment: Appointment) -> OfferGenerationResult:
    """
    Handler to trigger offer generation when an appointment is completed.
    """
    logger.info(
        "offers.triggered_by_completion appointment_id=%s tenant_id=%s",
        appointment.id,
        appointment.tenant_id,
    )
    return generate_offers_for_appointment(db, appointment=appointment)


def get_appointment_offer_metrics(db: Session, tenant_id: int) -> dict[str, int]:
    """
    Compute offer metrics for a tenant:
      - impressions: delivered, viewed, accepted
      - clicks: viewed, accepted
      - acceptance rate: accepted
      - redemption rate: redeemed
      - opt outs: declined
    Returns a dict of metric counts.
    """
    query = (
        db.query(OfferDelivery)
        .join(OfferDelivery.recommendation)
        .join(Recommendation.appointment)
        .filter(Appointment.tenant_id == tenant_id)
    )
    delivered = query.filter(OfferDelivery.offer_status.in_([OfferDeliveryStatus.DELIVERED])).count()
    viewed = query.filter(OfferDelivery.offer_status.in_([OfferDeliveryStatus.VIEWED])).count()
    accepted = query.filter(OfferDelivery.offer_status.in_([OfferDeliveryStatus.ACCEPTED])).count()
    redeemed = db.query(OfferAcceptance).join(OfferAcceptance.offer_delivery).join(OfferDelivery.recommendation).join(Recommendation.appointment).filter(Appointment.tenant_id == tenant_id).count()
    declined = query.filter(OfferDelivery.offer_status == OfferDeliveryStatus.DECLINED).count()
    return {
        "offer_impressions": delivered + viewed + accepted,
        "offer_clicks": viewed + accepted,
        "offer_acceptance_rate": accepted,
        "offer_redemption_rate": redeemed,
        "offer_opt_outs": declined,
    }


def expire_offer_if_needed(offer: OfferDelivery) -> bool:
    """
    Expire an offer if its expiration date has passed and it is not already accepted or declined.
    Returns True if the offer was expired, False otherwise.
    """
    if (
        offer.offer_status not in {OfferDeliveryStatus.ACCEPTED, OfferDeliveryStatus.DECLINED}
        and offer.expires_at is not None
        and offer.expires_at <= datetime.now(timezone.utc)
    ):
        offer.offer_status = OfferDeliveryStatus.EXPIRED
        logger.info("offers.expired offer_id=%s client_id=%s", offer.id, offer.client_id)
        return True
    return False


def list_client_offers(db: Session, client_id: int) -> list[OfferDelivery]:
    """
    List all offers for a client, expiring any that are past expiration.
    Commits and refreshes offers if any were expired.
    Returns a list of OfferDelivery objects.
    """
    offers = (
        db.query(OfferDelivery)
        .options(
            joinedload(OfferDelivery.recommendation),
            joinedload(OfferDelivery.acceptance),
        )
        .filter(OfferDelivery.client_id == client_id)
        .order_by(OfferDelivery.created_at.desc(), OfferDelivery.id.desc())
        .all()
    )
    changed = False
    for offer in offers:
        changed = expire_offer_if_needed(offer) or changed
    if changed:
        db.commit()
        for offer in offers:
            db.refresh(offer)
    return offers


def mark_offer_viewed(db: Session, offer: OfferDelivery) -> OfferDelivery:
    """
    Mark an offer as viewed by the client.
    - If expired, raises HTTPException.
    - If delivered or pending, updates status to VIEWED.
    Returns the updated OfferDelivery.
    """
    if expire_offer_if_needed(offer):
        db.commit()
        db.refresh(offer)
        raise HTTPException(400, "Offer has expired")

    if offer.offer_status in {OfferDeliveryStatus.DELIVERED, OfferDeliveryStatus.PENDING}:
        offer.offer_status = OfferDeliveryStatus.VIEWED
        db.commit()
        db.refresh(offer)
        logger.info("offers.viewed offer_id=%s client_id=%s", offer.id, offer.client_id)
        return offer

    return offer


def accept_offer(
    db: Session,
    *,
    offer: OfferDelivery,
    redemption_method: str | None,
    transaction_id: str | None,
) -> OfferDelivery:
    """
    Accept an offer:
      - If expired, raises HTTPException.
      - If declined, raises HTTPException.
      - If not already accepted, creates OfferAcceptance record.
      - Updates status to ACCEPTED.
    Returns the updated OfferDelivery.
    """
    if expire_offer_if_needed(offer):
        db.commit()
        db.refresh(offer)
        raise HTTPException(400, "Offer has expired")

    if offer.offer_status == OfferDeliveryStatus.DECLINED:
        raise HTTPException(400, "Declined offers cannot be accepted")

    if offer.acceptance is None:
        db.add(
            OfferAcceptance(
                offer_delivery_id=offer.id,
                accepted_at=datetime.now(timezone.utc),
                redemption_method=redemption_method,
                transaction_id=transaction_id,
            )
        )
    offer.offer_status = OfferDeliveryStatus.ACCEPTED
    db.commit()
    db.refresh(offer)
    logger.info(
        "offers.accepted offer_id=%s client_id=%s redemption_method=%s has_transaction=%s",
        offer.id,
        offer.client_id,
        redemption_method,
        bool(transaction_id),
    )
    return offer


def decline_offer(db: Session, *, offer: OfferDelivery) -> OfferDelivery:
    """
    Decline an offer:
      - If expired, returns offer.
      - If accepted, raises HTTPException.
      - If not already declined, updates status to DECLINED.
    Returns the updated OfferDelivery.
    """
    if expire_offer_if_needed(offer):
        db.commit()
        db.refresh(offer)
        return offer

    if offer.offer_status == OfferDeliveryStatus.ACCEPTED:
        raise HTTPException(400, "Accepted offers cannot be declined")

    if offer.offer_status != OfferDeliveryStatus.DECLINED:
        offer.offer_status = OfferDeliveryStatus.DECLINED
        db.commit()
        db.refresh(offer)
        logger.info("offers.declined offer_id=%s client_id=%s", offer.id, offer.client_id)

    return offer
