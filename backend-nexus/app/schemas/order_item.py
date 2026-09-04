from pydantic import BaseModel, ConfigDict


class OrderItemBase(BaseModel):
    order_id: int
    product_id: int
    quantity: int
    price_at_purchase: float


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemRead(OrderItemBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
