import enum
from sqlalchemy import ForeignKey, DateTime, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base, TimestampMixin


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"


class TenantSubscription(Base, TimestampMixin):
    __tablename__ = "tenant_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    subscription_plan_id: Mapped[int] = mapped_column(
        ForeignKey("subscription_plans.id"), nullable=False
    )

    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status"),
        default=SubscriptionStatus.ACTIVE,
        nullable=False,
    )

    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="subscriptions")
    subscription_plan = relationship("SubscriptionPlan")
