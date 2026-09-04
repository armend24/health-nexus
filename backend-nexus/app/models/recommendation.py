from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Recommendation(Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        UniqueConstraint(
            "appointment_id",
            "category",
            "recommendation_type",
            name="uq_recommendation_appointment_category_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), nullable=False)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    recommendation_type: Mapped[str] = mapped_column(String(100), nullable=False)
    approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )

    appointment = relationship("Appointment", backref="recommendations")
    doctor = relationship("User", foreign_keys=[doctor_id])
    client = relationship("User", foreign_keys=[client_id])
