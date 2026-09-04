import enum

from sqlalchemy import ForeignKey, ForeignKeyConstraint, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class CartStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    CONVERTED = "CONVERTED"
    ABANDONDED = "ABANDONDED"


class Cart(Base, TimestampMixin):
    __tablename__ = "carts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "patient_user_id"],
            ["patients.tenant_id", "patients.user_id"],
            name="fk_carts_patient_tenant_user",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    patient_user_id: Mapped[int] = mapped_column(nullable=False)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    status: Mapped[CartStatus] = mapped_column(
        Enum(CartStatus, name="cart_status"), default=CartStatus.ACTIVE, nullable=False
    )

    # Relationships
    tenant = relationship("Tenant", back_populates="carts", overlaps="patient,carts")
    patient = relationship("Patient", back_populates="carts", overlaps="tenant,carts")

    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")
