from sqlalchemy import String, Text, DECIMAL, Boolean, ForeignKey, Interval, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class UserTenantPlan(Base, TimestampMixin):
    __tablename__ = "user_tenant_plans"

    id: Mapped[int] = mapped_column(primary_key=True)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)

    description: Mapped[str | None] = mapped_column(Text)

    price: Mapped[float] = mapped_column(DECIMAL, nullable=False)

    duration: Mapped[int | None] = mapped_column(Integer)

    max_appointments: Mapped[int | None]
    max_consultations: Mapped[int | None]

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="user_tenant_plans")

    enrollments = relationship(
        "Enrollment", back_populates="user_tenant_plan", cascade="all, delete-orphan"
    )
