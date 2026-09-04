from pydantic import BaseModel, ConfigDict
from enum import Enum
from typing import Optional


class PaymentStatus(str, Enum):
    INITIATED = "INITIATED"
    AUTHORIZED = "AUTHORIZED"
    CAPTURED = "CAPTURED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
    REFUNDED = "REFUNDED"
    DISPUTED = "DISPUTED"
    REQUIRES_MANUAL_INTERVENTION = "REQUIRES_MANUAL_INTERVENTION"


class PaymentType(str, Enum):
    TENANT_SUBSCRIPTION = "TENANT_SUBSCRIPTION"
    ENROLLMENT = "ENROLLMENT"
    ORDER = "ORDER"
    CONSULTATION = "CONSULTATION"


class PaymentBase(BaseModel):
    payment_type: PaymentType
    price: float
    tenant_id: int
    reference_id: Optional[int] = None
    reference_type: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None


class PaymentCreate(PaymentBase):
    pass


class PaymentRead(PaymentBase):
    payment_id: int
    status: PaymentStatus

    model_config = ConfigDict(from_attributes=True)


class CheckoutInitiateRequest(BaseModel):
    order_id: Optional[int] = None
    enrollment_id: Optional[int] = None
    tenant_subscription_id: Optional[int] = None


class CheckoutInitiateResponse(BaseModel):
    payment_id: int
    status: PaymentStatus
    stripe_payment_intent_id: Optional[str] = None
    stripe_client_secret: Optional[str] = None
    amount: float
    tenant_id: int

    model_config = ConfigDict(from_attributes=True)


class CheckoutPaymentStatusResponse(BaseModel):
    payment_id: int
    status: PaymentStatus
    stripe_payment_intent_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
