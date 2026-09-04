from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class OfferAcceptance(Base, TimestampMixin):
    __tablename__ = "offer_acceptance"
    __table_args__ = (
        UniqueConstraint("offer_delivery_id", name="uq_offer_acceptance_delivery"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    offer_delivery_id: Mapped[int] = mapped_column(
        ForeignKey("offer_deliveries.id"), nullable=False
    )
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )
    redemption_method: Mapped[str | None] = mapped_column(String(100), nullable=True)
    transaction_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    offer_delivery = relationship("OfferDelivery", back_populates="acceptance")
