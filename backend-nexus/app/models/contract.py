import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, DateTime, Text, Enum, JSON, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class ContractStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    TERMINATED = "TERMINATED"


class Contract(Base, TimestampMixin):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id"),
        nullable=False,
        index=True,
    )

    doctor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("doctors.user_id"),
        nullable=True,
        index=True,
    )

    status: Mapped[ContractStatus] = mapped_column(
        Enum(ContractStatus, name="contract_status"),
        default=ContractStatus.DRAFT,
        nullable=False,
    )

    salary: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    terms_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    activated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    terms_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    terminated_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    doctor_signed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    doctor_signature: Mapped[str | None] = mapped_column(Text, nullable=True)

    hospital_signed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    hospital_signature: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="contracts")
    doctor = relationship("Doctor", back_populates="contracts")
