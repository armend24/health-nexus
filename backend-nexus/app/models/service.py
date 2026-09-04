from sqlalchemy import String, Text, Boolean, ForeignKey, DECIMAL, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Service(Base, TimestampMixin):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    price: Mapped[float] = mapped_column(DECIMAL, nullable=False)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant_departments_id: Mapped[int] = mapped_column(
        ForeignKey("tenant_departments.id"), nullable=False, index=True
    )

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    tenant_department = relationship("TenantDepartment", back_populates="services")
    tenant = relationship("Tenant", back_populates="services")

    __table_args__ = (UniqueConstraint("tenant_departments_id", "name"),)
