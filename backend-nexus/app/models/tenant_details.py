from sqlalchemy import String, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin


class TenantDetails(Base, TimestampMixin):
    __tablename__ = "tenant_details"

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), primary_key=True)

    # Branding fields
    logo: Mapped[str] = mapped_column(String(255), nullable=True)
    image: Mapped[str] = mapped_column(
        String(255), nullable=True
    )  # hero/cover image for public listing
    moto: Mapped[str] = mapped_column(String(255), nullable=True)
    brand_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("brand_palettes.id"), nullable=True
    )

    # Content fields
    title: Mapped[str] = mapped_column(String(255), nullable=True)
    about_text: Mapped[str] = mapped_column(String(1000), nullable=True)
    font_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("fonts.id"), nullable=True)

    tenant = relationship("Tenant", back_populates="details")
    brand = relationship("BrandPalette", foreign_keys=[brand_id])
    font = relationship("Font")
