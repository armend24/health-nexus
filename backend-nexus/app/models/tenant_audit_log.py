from sqlalchemy import String, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from datetime import datetime
from .base import Base, TimestampMixin


class TenantAuditEventType:
    CREATION = "CREATION"
    STATUS_CHANGE = "STATUS_CHANGE"
    UPDATE = "UPDATE"
    SUBSCRIPTION_CHANGE = "SUBSCRIPTION_CHANGE"
    DELETION = "DELETION"


class TenantAuditLog(Base, TimestampMixin):
    __tablename__ = "tenant_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)

    # What happened
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Which entity was affected
    entity_name: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[int | None]

    # Change tracking (VERY IMPORTANT)
    old_value: Mapped[dict | None] = mapped_column(JSON)
    new_value: Mapped[dict | None] = mapped_column(JSON)

    # Who performed action (mock for now)
    performed_by_user_id: Mapped[int | None]
    performed_by_role: Mapped[str | None]

    # Security + compliance
    ip_address: Mapped[str | None] = mapped_column(String(100))

    reason: Mapped[str | None] = mapped_column(String(500))
