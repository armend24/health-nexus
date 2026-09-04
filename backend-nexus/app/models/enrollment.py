import enum
from datetime import datetime

from sqlalchemy import ForeignKey, ForeignKeyConstraint, UniqueConstraint, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class EnrollmentStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class Enrollment(Base, TimestampMixin):
    __tablename__ = "enrollments"

    __table_args__ = (
        # Enforces registration->enrollment tenant handoff:
        # enrollment.tenant_id must match patient.tenant_id.
        ForeignKeyConstraint(
            ["tenant_id", "patient_user_id"],
            ["patients.tenant_id", "patients.user_id"],
            name="fk_enrollments_patient_tenant_user",
        ),
        UniqueConstraint("tenant_id", "patient_user_id", name="uq_enrollment_patient_tenant"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    patient_user_id: Mapped[int] = mapped_column(nullable=False)

    user_tenant_plan_id: Mapped[int] = mapped_column(
        ForeignKey("user_tenant_plans.id"), nullable=False
    )

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    status: Mapped[EnrollmentStatus] = mapped_column(
        Enum(EnrollmentStatus, name="enrollment_status"),
        default=EnrollmentStatus.PENDING,
        nullable=False,
    )

    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="enrollments", overlaps="patient")

    patient = relationship("Patient", overlaps="tenant,enrollments")

    user_tenant_plan = relationship("UserTenantPlan", back_populates="enrollments")

    creator = relationship("User")
