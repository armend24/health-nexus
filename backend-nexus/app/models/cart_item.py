from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[int] = mapped_column(primary_key=True)

    cart_id: Mapped[int] = mapped_column(ForeignKey("carts.id"), nullable=False)

    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"), nullable=False)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    cart = relationship("Cart", back_populates="items")
    product = relationship("Product")
