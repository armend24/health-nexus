from datetime import datetime

from sqlalchemy import ForeignKey, Enum, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .base import Base
from .lead import LeadStatus


class LeadStatusHistory(Base):
    """Audit trail of lead status transitions through the sales pipeline.
    Tracks every status change, who made it, when it happened, and why.
    Enables analysis of lead behavior and sales conversion metrics.
    """
    __tablename__ = "lead_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)

    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)

    # Previous pipeline stage.
    old_status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus, name="lead_status"), nullable=False
    )
    # New pipeline stage after this transition.
    new_status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus, name="lead_status"), nullable=False
    )

    changed_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Why the status changed (e.g., "Lead declined further follow-up", "Consultation completed").
    reason: Mapped[str | None] = mapped_column(Text)

    # Relationships
    lead = relationship("Lead", back_populates="status_history")
    changed_by_user = relationship("User")
