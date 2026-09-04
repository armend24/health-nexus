import enum
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, Text, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import ENUM

from .base import Base


class ConsultationStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"


class CancelledByActor(str, enum.Enum):
    LEAD = "LEAD"
    SALES = "SALES"


class ConsultationBooking(Base):
    """Consultation session scheduled between a sales agent and a lead.
    A lead may have multiple consultation bookings over time.
    """
    __tablename__ = "consultation_bookings"

    id: Mapped[int] = mapped_column(primary_key=True)

    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), nullable=False)

    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)

    meeting_link: Mapped[str | None] = mapped_column(Text)

    location: Mapped[str | None] = mapped_column(Text)

    status: Mapped[ConsultationStatus] = mapped_column(
        ENUM(ConsultationStatus, name="consultation_status", create_type=True),
        server_default="SCHEDULED",
        nullable=False,
    )

    # Sales user/agent who created this booking.
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Who initiated the cancellation: LEAD or SALES.
    cancelled_by_actor: Mapped[CancelledByActor | None] = mapped_column(
        Enum(CancelledByActor, name="cancelled_by_actor"), nullable=True
    )

    cancellation_reason: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    lead = relationship("Lead", back_populates="consultation_bookings")
    created_by_user = relationship("User")
