import enum

from sqlalchemy import ForeignKey, Enum, DECIMAL, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class PaymentStatus(str, enum.Enum):
    INITIATED = "INITIATED"
    AUTHORIZED = "AUTHORIZED"
    CAPTURED = "CAPTURED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
    REFUNDED = "REFUNDED"
    DISPUTED = "DISPUTED"
    REQUIRES_MANUAL_INTERVENTION = "REQUIRES_MANUAL_INTERVENTION"


class PaymentType(str, enum.Enum):
    TENANT_SUBSCRIPTION = "TENANT_SUBSCRIPTION"
    ENROLLMENT = "ENROLLMENT"
    ORDER = "ORDER"
    CONSULTATION = "CONSULTATION"


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "payment_type",
            "reference_id",
            "idempotency_key",
            name="uq_payment_idempotency",
        ),
    )

    payment_id: Mapped[int] = mapped_column(primary_key=True)

    payment_type: Mapped[PaymentType] = mapped_column(
        Enum(PaymentType, name="payment_type"), nullable=False
    )

    price: Mapped[float] = mapped_column(DECIMAL, nullable=False)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    stripe_payment_intent_id: Mapped[str | None] = mapped_column(Text)

    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), default=PaymentStatus.INITIATED, nullable=False
    )

    reference_id: Mapped[int | None] = mapped_column(Integer)
    reference_type: Mapped[str | None] = mapped_column(Text)

    idempotency_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    external_event_id: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    audit_notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    tenant = relationship("Tenant", back_populates="payments")
