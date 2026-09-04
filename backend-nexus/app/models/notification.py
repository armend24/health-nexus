import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class NotificationType(str, enum.Enum):
    APPOINTMENT_CREATED = "APPOINTMENT_CREATED"
    APPOINTMENT_CONFIRMED = "APPOINTMENT_CONFIRMED"
    APPOINTMENT_REJECTED = "APPOINTMENT_REJECTED"
    APPOINTMENT_CANCELLED = "APPOINTMENT_CANCELLED"
    APPOINTMENT_RESCHEDULED = "APPOINTMENT_RESCHEDULED"
    APPOINTMENT_COMPLETED = "APPOINTMENT_COMPLETED"
    OFFER_DELIVERED = "OFFER_DELIVERED"
    TENANT_SUBSCRIPTION_CANCELLED = "TENANT_SUBSCRIPTION_CANCELLED"


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id"), nullable=False)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
