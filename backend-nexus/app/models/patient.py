from sqlalchemy import Date, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Patient(Base, TimestampMixin):
    __tablename__ = "patients"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "user_id",
            name="uq_patients_tenant_user",
        ),
    )

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id"),
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)

    birthdate: Mapped[str | None] = mapped_column(Date, nullable=True)

    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)

    blood_type: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Relationships
    tenant = relationship(
        "Tenant",
        back_populates="patients",
    )

    user = relationship(
        "User",
        back_populates="patient_profile",
    )

    appointments = relationship("Appointment", back_populates="patient", overlaps="tenant")

    carts = relationship(
        "Cart", back_populates="patient", overlaps="tenant,carts", cascade="all, delete-orphan"
    )

    orders = relationship(
        "Order", back_populates="patient", overlaps="tenant,orders", cascade="all, delete-orphan"
    )
