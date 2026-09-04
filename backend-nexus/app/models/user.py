from sqlalchemy import Column, Integer, String, ForeignKey, Text, TIMESTAMP
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from .base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    first_name = Column(String(100))
    last_name = Column(String(100))

    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(Text, nullable=False)

    role_id = Column(Integer, ForeignKey("roles.id"))

    contact = Column(String(50))
    address = Column(Text)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    role = relationship("Role", back_populates="users")

    doctor_profile = relationship("Doctor", back_populates="user", uselist=False)

    patient_profile = relationship(
        "Patient",
        back_populates="user",
    )

    managed_tenants = relationship(
        "TenantManager", back_populates="user", cascade="all, delete-orphan"
    )
