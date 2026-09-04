from sqlalchemy import String, Numeric, Integer, Interval
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class SubscriptionPlan(Base, TimestampMixin):
    __tablename__ = "subscription_plans"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(String(100), unique=True)

    price: Mapped[float] = mapped_column(Numeric(10, 2))

    # Store duration as integer days
    duration: Mapped[int] = mapped_column(Integer)

    max_doctors: Mapped[int] = mapped_column(Integer, nullable=True)
    max_patients: Mapped[int] = mapped_column(Integer, nullable=True)
    max_departments: Mapped[int] = mapped_column(Integer, nullable=True)

    subscriptions = relationship(
        "TenantSubscription", back_populates="subscription_plan", cascade="all, delete-orphan"
    )
