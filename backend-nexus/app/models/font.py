from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class Font(Base, TimestampMixin):
    """Curated font option for tenant branding (header + body pair)."""

    __tablename__ = "fonts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    header_font_family: Mapped[str] = mapped_column(
        String(200), nullable=False
    )  # e.g. "Inter", "Poppins"
    body_font_family: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # for display order
