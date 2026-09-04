from datetime import datetime, timedelta, timezone

from app.models.notification import Notification, NotificationType
from app.models.offer_acceptance import OfferAcceptance
from app.models.offer_delivery import OfferDelivery, OfferDeliveryStatus
from app.models.recommendation import Recommendation


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _book_appointment(ctx, slot: str) -> int:
    response = ctx["client"].post(
        "/appointments/book",
        headers=_auth(ctx["patient_token"]),
        json={
            "tenant_id": ctx["tenant_id"],
            "doctor_id": ctx["doctor_id"],
            "department_id": ctx["department_id"],
            "appointment_datetime": slot,
            "duration_minutes": 30,
            "description": "PRD-12 validation booking",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _seed_recommendations(ctx, appointment_id: int):
    ctx["db"].add_all(
        [
            Recommendation(
                appointment_id=appointment_id,
                doctor_id=ctx["doctor_id"],
                client_id=ctx["patient_id"],
                category="CARE_PLAN",
                recommendation_type="Nutrition care plan",
                approved=True,
            ),
            Recommendation(
                appointment_id=appointment_id,
                doctor_id=ctx["doctor_id"],
                client_id=ctx["patient_id"],
                category="UNSUPPORTED",
                recommendation_type="Should never become an offer",
                approved=True,
            ),
            Recommendation(
                appointment_id=appointment_id,
                doctor_id=ctx["doctor_id"],
                client_id=ctx["patient_id"],
                category="LAB_TEST",
                recommendation_type="Unapproved recommendation",
                approved=False,
            ),
        ]
    )
    ctx["db"].commit()


def test_completion_trigger_generates_only_approved_offers(offer_ctx):
    appointment_id = _book_appointment(offer_ctx, offer_ctx["slot_1"])
    _seed_recommendations(offer_ctx, appointment_id)

    before = offer_ctx["client"].get(
        f"/clients/{offer_ctx['patient_id']}/offers",
        headers=_auth(offer_ctx["patient_token"]),
    )
    assert before.status_code == 200
    assert before.json() == []

    approve = offer_ctx["client"].patch(
        f"/appointments/{appointment_id}/approve",
        headers=_auth(offer_ctx["doctor_token"]),
    )
    assert approve.status_code == 200

    complete = offer_ctx["client"].patch(
        f"/appointments/{appointment_id}/complete",
        headers=_auth(offer_ctx["doctor_token"]),
    )
    assert complete.status_code == 200
    assert complete.json()["status"] == "COMPLETED"

    after = offer_ctx["client"].get(
        f"/clients/{offer_ctx['patient_id']}/offers",
        headers=_auth(offer_ctx["patient_token"]),
    )
    assert after.status_code == 200
    payload = after.json()
    assert len(payload) == 1
    assert payload[0]["offer_status"] == "DELIVERED"
    assert payload[0]["recommendation"]["category"] == "CARE_PLAN"

    notification_count = (
        offer_ctx["db"]
        .query(Notification)
        .filter(
            Notification.user_id == offer_ctx["patient_id"],
            Notification.type == NotificationType.OFFER_DELIVERED,
        )
        .count()
    )
    assert notification_count == 1


def test_generate_endpoint_rejects_pre_completion_and_prevents_duplicates(offer_ctx):
    appointment_id = _book_appointment(offer_ctx, offer_ctx["slot_1"])
    _seed_recommendations(offer_ctx, appointment_id)

    early = offer_ctx["client"].post(
        "/offers/generate",
        headers=_auth(offer_ctx["doctor_token"]),
        json={"appointment_id": appointment_id, "delivery_channel": "IN_APP"},
    )
    assert early.status_code == 400

    offer_ctx["client"].patch(
        f"/appointments/{appointment_id}/approve",
        headers=_auth(offer_ctx["doctor_token"]),
    )
    offer_ctx["client"].patch(
        f"/appointments/{appointment_id}/complete",
        headers=_auth(offer_ctx["doctor_token"]),
    )

    repeat = offer_ctx["client"].post(
        "/offers/generate",
        headers=_auth(offer_ctx["doctor_token"]),
        json={"appointment_id": appointment_id, "delivery_channel": "IN_APP"},
    )
    assert repeat.status_code == 200
    payload = repeat.json()
    assert payload["eligible"] is True
    assert payload["created_count"] == 0
    assert payload["existing_count"] == 1


def test_client_can_view_and_accept_offer(offer_ctx):
    appointment_id = _book_appointment(offer_ctx, offer_ctx["slot_1"])
    _seed_recommendations(offer_ctx, appointment_id)
    offer_ctx["client"].patch(
        f"/appointments/{appointment_id}/approve",
        headers=_auth(offer_ctx["doctor_token"]),
    )
    offer_ctx["client"].patch(
        f"/appointments/{appointment_id}/complete",
        headers=_auth(offer_ctx["doctor_token"]),
    )

    offers = offer_ctx["client"].get(
        f"/clients/{offer_ctx['patient_id']}/offers",
        headers=_auth(offer_ctx["patient_token"]),
    ).json()
    offer_id = offers[0]["id"]

    view = offer_ctx["client"].post(
        f"/offers/{offer_id}/view",
        headers=_auth(offer_ctx["patient_token"]),
    )
    assert view.status_code == 200
    assert view.json()["offer_status"] == "VIEWED"

    accept = offer_ctx["client"].post(
        f"/offers/{offer_id}/accept",
        headers=_auth(offer_ctx["patient_token"]),
        json={"redemption_method": "CARD", "transaction_id": "txn_prd12_001"},
    )
    assert accept.status_code == 200
    assert accept.json()["offer_status"] == "ACCEPTED"
    assert accept.json()["acceptance"]["transaction_id"] == "txn_prd12_001"

    acceptance = (
        offer_ctx["db"]
        .query(OfferAcceptance)
        .filter(OfferAcceptance.offer_delivery_id == offer_id)
        .one()
    )
    assert acceptance.redemption_method == "CARD"


def test_expired_offer_cannot_be_accepted(offer_ctx):
    appointment_id = _book_appointment(offer_ctx, offer_ctx["slot_1"])
    _seed_recommendations(offer_ctx, appointment_id)
    offer_ctx["client"].patch(
        f"/appointments/{appointment_id}/approve",
        headers=_auth(offer_ctx["doctor_token"]),
    )
    offer_ctx["client"].patch(
        f"/appointments/{appointment_id}/complete",
        headers=_auth(offer_ctx["doctor_token"]),
    )

    offer = offer_ctx["db"].query(OfferDelivery).one()
    offer.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    offer_ctx["db"].commit()

    response = offer_ctx["client"].post(
        f"/offers/{offer.id}/accept",
        headers=_auth(offer_ctx["patient_token"]),
        json={"redemption_method": "CARD", "transaction_id": "txn_expired"},
    )
    assert response.status_code == 400

    offer_ctx["db"].refresh(offer)
    assert offer.offer_status == OfferDeliveryStatus.EXPIRED
