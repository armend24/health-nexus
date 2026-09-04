from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.offer_delivery import OfferDeliveryChannel, OfferDeliveryStatus


class OfferGenerateRequest(BaseModel):
    appointment_id: int
    delivery_channel: OfferDeliveryChannel = OfferDeliveryChannel.IN_APP
    expires_in_days: int = 14


class OfferViewResponse(BaseModel):
    id: int
    offer_status: OfferDeliveryStatus


class OfferAcceptanceRequest(BaseModel):
    redemption_method: str | None = None
    transaction_id: str | None = None


class OfferAcceptanceRead(BaseModel):
    id: int
    offer_delivery_id: int
    accepted_at: datetime
    redemption_method: str | None = None
    transaction_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class OfferRecommendationRead(BaseModel):
    id: int
    appointment_id: int
    doctor_id: int
    client_id: int
    category: str
    recommendation_type: str
    approved: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OfferDeliveryRead(BaseModel):
    id: int
    recommendation_id: int
    client_id: int
    offer_status: OfferDeliveryStatus
    delivery_channel: OfferDeliveryChannel
    sent_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    recommendation: OfferRecommendationRead
    acceptance: OfferAcceptanceRead | None = None

    model_config = ConfigDict(from_attributes=True)


class OfferGenerateResponse(BaseModel):
    appointment_id: int
    eligible: bool
    created_count: int
    existing_count: int
    skipped_count: int
    offers: list[OfferDeliveryRead]
