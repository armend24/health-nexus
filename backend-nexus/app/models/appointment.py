import enum
from sqlalchemy import ForeignKey, ForeignKeyConstraint, Text, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class AppointmentStatus(enum.Enum):
    REQUESTED = "REQUESTED"
    CONFIRMED = "CONFIRMED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Appointment(Base, TimestampMixin):
    __tablename__ = "appointments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "patient_user_id"],
            ["patients.tenant_id", "patients.user_id"],
            name="fk_appointments_patient_tenant_user",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    appointment_datetime: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[int] = mapped_column(nullable=False, default=30)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    doctor_user_id: Mapped[int] = mapped_column(ForeignKey("doctors.user_id"))

    patient_user_id: Mapped[int] = mapped_column(
        nullable=False,
    )

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"))

    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, name="appointment_status"), default=AppointmentStatus.REQUESTED
    )

    # Relationships
    doctor = relationship("Doctor", back_populates="appointments")
    patient = relationship("Patient", back_populates="appointments", overlaps="tenant")
    tenant = relationship("Tenant", overlaps="appointments,patient")
    status_history = relationship(
        "AppointmentStatusHistory", back_populates="appointment", cascade="all, delete-orphan"
    )
