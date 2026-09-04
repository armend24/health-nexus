import enum
from sqlalchemy import ForeignKey, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .base import Base
from .appointment import AppointmentStatus


class AppointmentStatusHistory(Base):
    __tablename__ = "appointment_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)

    appointment_id: Mapped[int] = mapped_column(
        ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False
    )

    old_status: Mapped[AppointmentStatus | None] = mapped_column(
        Enum(AppointmentStatus, name="appointment_status"), nullable=True
    )

    new_status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, name="appointment_status"), nullable=False
    )

    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    changed_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    appointment = relationship("Appointment", back_populates="status_history")
    user = relationship("User")
