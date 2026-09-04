from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user
from app.db import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.offer_delivery import OfferDelivery
from app.models.user import User
from app.schemas.offer_delivery import (
    OfferAcceptanceRequest,
    OfferDeliveryRead,
    OfferGenerateRequest,
    OfferGenerateResponse,
    OfferViewResponse,
)
from app.services.offer_service import (
    accept_offer,
    decline_offer,
    generate_offers_for_appointment,
    get_offer_by_id,
    list_client_offers,
    mark_offer_viewed,
)

router = APIRouter(tags=["Offers"])


def _normalize_role(current_user: dict) -> str:
    """
    Normalize the user's role to uppercase string.
    """
    return str(current_user.get("role", "")).strip().upper()


def _require_offer_access(current_user: dict, client_id: int, tenant_id: int):
    """
    Enforce access control for offer endpoints based on user role and tenant.
    - CLIENT: can only access their own offers
    - DOCTOR, SALES, TENANT_MANAGER: must match tenant
    - SUPER_ADMIN: can access any tenant
    Raises HTTPException if access is denied.
    """
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")

    role = _normalize_role(current_user)
    current_tenant_id = current_user.get("tenant_id")
    if current_tenant_id is not None:
        try:
            current_tenant_id = int(current_tenant_id)
        except (TypeError, ValueError):
            raise HTTPException(403, "Tenant access denied")
    if role == "CLIENT":
        if user_id != client_id:
            raise HTTPException(403, "You can only access your own offers")
        return

    if role not in {"DOCTOR", "SALES", "TENANT_MANAGER", "SUPER_ADMIN"}:
        raise HTTPException(403, "Insufficient permissions")

    if role != "SUPER_ADMIN" and current_tenant_id != tenant_id:
        raise HTTPException(403, "Tenant access denied")


def _require_client_owner(current_user: dict, offer: OfferDelivery):
    """
    Ensure the current user is the owner of the offer (client).
    Raises HTTPException if not owner.
    """
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")
    if user_id != offer.client_id:
        raise HTTPException(403, "You can only act on your own offers")


@router.post("/offers/generate", response_model=OfferGenerateResponse)
def generate_offers(
    payload: OfferGenerateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Endpoint to generate post-appointment offers for a completed appointment.
    - Requires appointment to be COMPLETED.
    - Enforces access control.
    - Returns OfferGenerateResponse with created and existing offers.
    """
    appointment = db.query(Appointment).filter(Appointment.id == payload.appointment_id).first()
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    if appointment.status != AppointmentStatus.COMPLETED:
        raise HTTPException(400, "Offers can only be generated after appointment completion")

    _require_offer_access(current_user, appointment.patient_user_id, appointment.tenant_id)

    result = generate_offers_for_appointment(
        db,
        appointment=appointment,
        delivery_channel=payload.delivery_channel,
        expires_in_days=payload.expires_in_days,
    )
    db.commit()

    offers = []
    for offer in [*result.created, *result.existing]:
        hydrated_offer = get_offer_by_id(db, offer.id)
        if hydrated_offer is not None:
            offers.append(hydrated_offer)

    return OfferGenerateResponse(
        appointment_id=result.appointment_id,
        eligible=result.eligible,
        created_count=len(result.created),
        existing_count=len(result.existing),
        skipped_count=result.skipped_count,
        offers=offers,
    )


@router.get("/clients/{client_id}/offers", response_model=list[OfferDeliveryRead])
def get_client_offers(
    client_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Endpoint to list all offers for a client.
    - Enforces access control.
    - Returns a list of OfferDeliveryRead objects.
    """
    user = db.query(User).filter(User.id == client_id).first()
    if not user:
        raise HTTPException(404, "Client not found")

    offers = list_client_offers(db, client_id)
    if offers:
        tenant_id = offers[0].recommendation.appointment.tenant_id
    else:
        tenant_id = current_user.get("tenant_id")
        if tenant_id is None and _normalize_role(current_user) != "SUPER_ADMIN":
            raise HTTPException(403, "Tenant access denied")

    _require_offer_access(current_user, client_id, tenant_id)
    return offers


@router.post("/offers/{offer_id}/view", response_model=OfferViewResponse)
def view_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Endpoint for client to mark an offer as viewed.
    - Enforces client ownership.
    - Returns OfferViewResponse with updated status.
    """
    offer = get_offer_by_id(db, offer_id)
    if not offer:
        raise HTTPException(404, "Offer not found")
    _require_client_owner(current_user, offer)
    offer = mark_offer_viewed(db, offer)
    return OfferViewResponse(id=offer.id, offer_status=offer.offer_status)


@router.post("/offers/{offer_id}/accept", response_model=OfferDeliveryRead)
def accept_offer_endpoint(
    offer_id: int,
    payload: OfferAcceptanceRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Endpoint for client to accept an offer.
    - Enforces client ownership.
    - Accepts offer with redemption method and transaction id.
    - Returns updated OfferDeliveryRead.
    """
    offer = get_offer_by_id(db, offer_id)
    if not offer:
        raise HTTPException(404, "Offer not found")
    _require_client_owner(current_user, offer)
    return accept_offer(
        db,
        offer=offer,
        redemption_method=payload.redemption_method,
        transaction_id=payload.transaction_id,
    )


@router.post("/offers/{offer_id}/decline", response_model=OfferViewResponse)
def decline_offer_endpoint(
    offer_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Endpoint for client to decline an offer.
    - Enforces client ownership.
    - Returns OfferViewResponse with updated status.
    """
    offer = get_offer_by_id(db, offer_id)
    if not offer:
        raise HTTPException(404, "Offer not found")
    _require_client_owner(current_user, offer)
    offer = decline_offer(db, offer=offer)
    return OfferViewResponse(id=offer.id, offer_status=offer.offer_status)
