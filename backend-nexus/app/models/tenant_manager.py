from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class TenantManager(Base):
    __tablename__ = "tenant_managers"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), primary_key=True)

    # Relationships
    user = relationship("User", back_populates="managed_tenants")
    tenant = relationship("Tenant", back_populates="managers")
