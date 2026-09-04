import enum
from datetime import datetime

from sqlalchemy import String, Enum, ForeignKey, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class LeadStatus(str, enum.Enum):
    NEW = "NEW"
    QUALIFIED = "QUALIFIED"
    CONTACTED = "CONTACTED"
    CONSULTATION_SCHEDULED = "CONSULTATION_SCHEDULED"
    CONSULTATION_COMPLETED = "CONSULTATION_COMPLETED"
    AWAITING_DECISION = "AWAITING_DECISION"
    CONVERTED = "CONVERTED"
    REJECTED = "REJECTED"
    LOST = "LOST"


class Lead(Base, TimestampMixin):
    """Sales lead created when an organization submits a consultation request.
    Tracks the organization through the sales pipeline and stores ownership by sales.
    """
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Required to verify organization legitimacy.
    licence_number: Mapped[str] = mapped_column(String(255), nullable=False)
    organization_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    # Initial message/inquiry from organization (e.g., questions, context, requirements).
    initial_message: Mapped[str | None] = mapped_column(Text)
    # How lead entered the system (e.g., "consultation form", "referral", "campaign").
    source: Mapped[str | None] = mapped_column(String(100))

    status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus, name="lead_status"), default=LeadStatus.NEW, nullable=False
    )

    # Sales user that is managing the lead.
    assigned_sales_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    # Next planned step in the sales process (e.g., "Follow up Tuesday", "Await response").
    next_action: Mapped[str | None] = mapped_column(Text)
    next_action_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    assigned_sales_user = relationship("User", foreign_keys=[assigned_sales_user_id])
    status_history = relationship(
        "LeadStatusHistory", back_populates="lead", cascade="all, delete-orphan"
    )
    consultation_bookings = relationship(
        "ConsultationBooking", back_populates="lead", cascade="all, delete-orphan"
    )
