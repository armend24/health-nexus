"""Curated color palette for tenant branding. Colors only (fonts are separate)."""

from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class BrandPalette(Base, TimestampMixin):
    """Preset color palette (primary, secondary, background, foreground, muted) for tenant branding."""

    __tablename__ = "brand_palettes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    brand_color_primary: Mapped[str] = mapped_column(String(7), nullable=False)
    brand_color_secondary: Mapped[str] = mapped_column(String(7), nullable=False)
    brand_color_background: Mapped[str] = mapped_column(String(7), nullable=False)
    brand_color_foreground: Mapped[str] = mapped_column(String(7), nullable=False)
    brand_color_muted: Mapped[str] = mapped_column(String(7), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
