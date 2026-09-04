# app/models/report.py

from sqlalchemy import (
    ForeignKey,
    ForeignKeyConstraint,
    Text,
    TIMESTAMP,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .base import Base


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "patient_user_id"],
            ["patients.tenant_id", "patients.user_id"],
            name="fk_reports_patient_tenant_user",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    appointment_id: Mapped[int] = mapped_column(
        ForeignKey("appointments.id"), unique=True, nullable=False
    )

    diagnosis: Mapped[str | None] = mapped_column(Text, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    medicine: Mapped[str | None] = mapped_column(Text, nullable=True)

    doctor_user_id: Mapped[int] = mapped_column(ForeignKey("doctors.user_id"), nullable=False)

    patient_user_id: Mapped[int] = mapped_column(nullable=False)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    created_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )

    # Relationships
    appointment = relationship("Appointment")
    doctor = relationship("Doctor")
    patient = relationship("Patient", overlaps="tenant")
    tenant = relationship("Tenant", overlaps="patient")
