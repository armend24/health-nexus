import enum
from sqlalchemy import ForeignKey, String, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import TimestampMixin, Base


class AuditEvent(Base, TimestampMixin):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    entity_type: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[int] = mapped_column()

    action: Mapped[str] = mapped_column(String(50))

    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    tenant = relationship("Tenant")
    actor = relationship("User")
