from pydantic import BaseModel, ConfigDict


class CartItemBase(BaseModel):
    cart_id: int
    product_id: int
    quantity: int


class CartItemCreate(CartItemBase):
    pass


class CartItemRead(CartItemBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
