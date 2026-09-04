from sqlalchemy import String, Integer, Boolean, ForeignKey, DECIMAL
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Product(Base):
    __tablename__ = "products"

    product_id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None]
    category: Mapped[str | None] = mapped_column(String(100))
    image_url: Mapped[str | None] = mapped_column(String(1024))
    price: Mapped[float] = mapped_column(DECIMAL, nullable=False)
    stock_quantity: Mapped[int] = mapped_column(default=0)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)

    tenant = relationship("Tenant", back_populates="products")
