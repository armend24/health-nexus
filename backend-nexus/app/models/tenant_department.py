from sqlalchemy import String, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TenantDepartment(Base, TimestampMixin):
    __tablename__ = "tenant_departments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)

    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id"), nullable=False, index=True
    )

    phone_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)

    location: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="tenant_departments")

    department = relationship("Department", back_populates="tenant_departments")

    doctors = relationship("Doctor", back_populates="tenant_department")

    services = relationship(
        "Service", back_populates="tenant_department", cascade="all, delete-orphan"
    )
