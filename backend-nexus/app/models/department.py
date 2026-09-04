from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Department(Base, TimestampMixin):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)

    tenant_departments = relationship(
        "TenantDepartment", back_populates="department", cascade="all, delete-orphan"
    )
