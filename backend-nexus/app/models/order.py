import enum

from sqlalchemy import ForeignKey, ForeignKeyConstraint, Enum, DECIMAL
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "patient_user_id"],
            ["patients.tenant_id", "patients.user_id"],
            name="fk_orders_patient_tenant_user",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    patient_user_id: Mapped[int] = mapped_column(nullable=False)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), default=OrderStatus.PENDING, nullable=False
    )

    subtotal: Mapped[float] = mapped_column(DECIMAL, default=0)
    tax: Mapped[float] = mapped_column(DECIMAL, default=0)
    discount: Mapped[float] = mapped_column(DECIMAL, default=0)
    total_amount: Mapped[float] = mapped_column(DECIMAL, default=0)

    # Relationships
    patient = relationship("Patient", back_populates="orders", overlaps="tenant,orders")
    tenant = relationship("Tenant", back_populates="orders", overlaps="patient,orders")

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
