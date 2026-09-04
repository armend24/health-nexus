from sqlalchemy import ForeignKey, Integer, DECIMAL
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)

    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)

    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"), nullable=False)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    price_at_purchase: Mapped[float] = mapped_column(DECIMAL, nullable=False)

    # Relationships
    order = relationship("Order", back_populates="items")
    product = relationship("Product")
