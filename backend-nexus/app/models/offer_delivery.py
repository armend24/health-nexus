import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class OfferDeliveryStatus(str, enum.Enum):
    PENDING = "PENDING"
    DELIVERED = "DELIVERED"
    VIEWED = "VIEWED"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    EXPIRED = "EXPIRED"


class OfferDeliveryChannel(str, enum.Enum):
    EMAIL = "EMAIL"
    IN_APP = "IN_APP"
    DASHBOARD = "DASHBOARD"


class OfferDelivery(Base, TimestampMixin):
    __tablename__ = "offer_deliveries"
    __table_args__ = (
        UniqueConstraint("recommendation_id", "client_id", name="uq_offer_delivery_recommendation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    recommendation_id: Mapped[int] = mapped_column(ForeignKey("recommendations.id"), nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    offer_status: Mapped[OfferDeliveryStatus] = mapped_column(
        Enum(OfferDeliveryStatus, name="offer_delivery_status"),
        default=OfferDeliveryStatus.PENDING,
        nullable=False,
    )
    delivery_channel: Mapped[OfferDeliveryChannel] = mapped_column(
        Enum(OfferDeliveryChannel, name="offer_delivery_channel"),
        default=OfferDeliveryChannel.IN_APP,
        nullable=False,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    recommendation = relationship("Recommendation", backref="offer_deliveries")
    client = relationship("User")
    acceptance = relationship(
        "OfferAcceptance",
        back_populates="offer_delivery",
        uselist=False,
        cascade="all, delete-orphan",
    )
