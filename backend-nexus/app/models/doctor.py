from sqlalchemy import String, Text, Boolean, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Doctor(Base, TimestampMixin):
    __tablename__ = "doctors"

    # Primary key = user_id (because doctor extends user)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)

    specialization: Mapped[str | None] = mapped_column(String(255), nullable=True)

    education: Mapped[str | None] = mapped_column(Text, nullable=True)

    licence_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    tenant_department_id: Mapped[int] = mapped_column(
        ForeignKey("tenant_departments.id"), nullable=False
    )

    working_hours: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    user = relationship("User", back_populates="doctor_profile")

    tenant = relationship("Tenant", back_populates="doctors")

    tenant_department = relationship("TenantDepartment", back_populates="doctors")
    appointments = relationship("Appointment", back_populates="doctor")

    contracts = relationship(
        "Contract",
        back_populates="doctor",
    )
