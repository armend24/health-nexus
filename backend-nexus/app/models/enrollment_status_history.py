from sqlalchemy import ForeignKey, DateTime, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base, TimestampMixin
from app.models.enrollment import EnrollmentStatus


class EnrollmentStatusHistory(Base, TimestampMixin):
    __tablename__ = "enrollment_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)

    enrollment_id: Mapped[int] = mapped_column(ForeignKey("enrollments.id"), nullable=False)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    old_status: Mapped[EnrollmentStatus] = mapped_column(
        Enum(EnrollmentStatus, name="enrollment_status_history_old")
    )

    new_status: Mapped[EnrollmentStatus] = mapped_column(
        Enum(EnrollmentStatus, name="enrollment_status_history_new")
    )

    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    changed_by_role: Mapped[str | None] = mapped_column(Text, nullable=True)

    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    enrollment = relationship("Enrollment")
