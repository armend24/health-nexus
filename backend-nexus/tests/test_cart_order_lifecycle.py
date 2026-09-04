import json
import os
import sys
import types
import uuid

import pytest
from fastapi.testclient import TestClient

from app.db import get_db as app_get_db
from app.models import (
    Cart,
    CartStatus,
    Order,
    OrderStatus,
    Payment,
    Product,
    Role,
    Tenant,
    TenantStatus,
    User,
)


def _install_fake_stripe():
    if "stripe" in sys.modules:
        return

    class StripeError(Exception):
        pass

    class SignatureVerificationError(StripeError):
        pass

    def create_payment_intent(**kwargs):
        suffix = uuid.uuid4().hex
        return {
            "id": f"pi_{suffix}",
            "client_secret": f"cs_{suffix}",
            "metadata": kwargs.get("metadata", {}),
        }

    def retrieve_payment_intent(intent_id):
        return {"id": intent_id, "status": "succeeded"}

    def construct_event(payload, signature, secret):
        del signature, secret
        if isinstance(payload, bytes):
            payload = payload.decode("utf-8")
        return json.loads(payload)

    stripe_module = types.SimpleNamespace(
        api_key="",
        PaymentIntent=types.SimpleNamespace(
            create=create_payment_intent,
            retrieve=retrieve_payment_intent,
        ),
        Webhook=types.SimpleNamespace(construct_event=construct_event),
        error=types.SimpleNamespace(
            StripeError=StripeError,
            SignatureVerificationError=SignatureVerificationError,
        ),
    )
    sys.modules["stripe"] = stripe_module


def _make_get_db_override(session):
    def overridden_get_db():
        yield session

    return overridden_get_db


@pytest.fixture
def commerce_client(db_session):
    _install_fake_stripe()
    os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_fake")
    os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_fake")
    from app.main import app

    override = _make_get_db_override(db_session)
    app.dependency_overrides[app_get_db] = override
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(app_get_db, None)


def _ensure_role(db_session, name: str) -> Role:
    role = db_session.query(Role).filter(Role.name == name).first()
    if role is None:
        role = Role(name=name)
        db_session.add(role)
        db_session.commit()
        db_session.refresh(role)
    return role


def _create_tenant(db_session, suffix: str) -> Tenant:
    tenant = Tenant(
        name=f"Commerce Tenant {suffix}",
        email=f"commerce-{suffix}@example.com",
        licence_number=f"COM-{suffix}",
        status=TenantStatus.approved,
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    return tenant


def _register_client(
    client: TestClient,
    db_session,
    tenant_id: int,
    *,
    email: str,
    password: str = "Pass1234!",
):
    response = client.post(
        f"/api/public/tenants/{tenant_id}/clients/register",
        json={
            "email": email,
            "first_name": "Store",
            "last_name": "Client",
            "password": password,
        },
    )
    assert response.status_code == 201, response.text
    user = db_session.query(User).filter(User.email == email).one()
    user.role_id = _ensure_role(db_session, "CLIENT").id
    db_session.commit()
    return user


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return {
        "Authorization": f"Bearer {response.json()['access_token']}",
    }


def _create_product(
    db_session,
    tenant_id: int,
    *,
    name: str = "Vitamin D",
    price: float = 19.99,
    stock_quantity: int = 10,
) -> Product:
    product = Product(
        tenant_id=tenant_id,
        name=name,
        description="Daily support supplement",
        category="vitamins",
        image_url="/uploads/tenant-branding/vitamin-d.png",
        price=price,
        stock_quantity=stock_quantity,
        is_available=True,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)
    return product


def _create_order_for_checkout(
    client: TestClient,
    headers: dict[str, str],
    tenant_id: int,
    product_id: int,
) -> int:
    add_response = client.post(
        "/api/cart/items",
        json={
            "tenant_id": tenant_id,
            "product_id": product_id,
            "quantity": 1,
        },
        headers=headers,
    )
    assert add_response.status_code == 201, add_response.text

    order_response = client.post(
        "/api/orders",
        json={"tenant_id": tenant_id},
        headers=headers,
    )
    assert order_response.status_code == 201, order_response.text
    return order_response.json()["id"]


def test_cart_crud_and_order_creation(commerce_client, db_session):
    tenant = _create_tenant(db_session, "crud")
    product = _create_product(db_session, tenant.id, stock_quantity=12)
    email = "cart-crud@example.com"
    password = "Pass1234!"

    user = _register_client(
        commerce_client,
        db_session,
        tenant.id,
        email=email,
        password=password,
    )
    headers = _login(commerce_client, email, password)

    add_response = commerce_client.post(
        "/api/cart/items",
        json={
            "tenant_id": tenant.id,
            "product_id": product.product_id,
            "quantity": 1,
        },
        headers=headers,
    )
    assert add_response.status_code == 201, add_response.text
    cart = add_response.json()
    assert cart["items"][0]["quantity"] == 1

    item_id = cart["items"][0]["id"]
    update_response = commerce_client.put(
        f"/api/cart/items/{item_id}",
        json={"quantity": 3},
        headers=headers,
    )
    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["items"][0]["quantity"] == 3

    delete_response = commerce_client.delete(
        f"/api/cart/items/{item_id}",
        headers=headers,
    )
    assert delete_response.status_code == 204, delete_response.text

    cart_response = commerce_client.get(
        f"/api/cart?tenant_id={tenant.id}",
        headers=headers,
    )
    assert cart_response.status_code == 200, cart_response.text
    assert cart_response.json()["items"] == []

    add_again_response = commerce_client.post(
        "/api/cart/items",
        json={
            "tenant_id": tenant.id,
            "product_id": product.product_id,
            "quantity": 2,
        },
        headers=headers,
    )
    assert add_again_response.status_code == 201, add_again_response.text

    create_order_response = commerce_client.post(
        "/api/orders",
        json={"tenant_id": tenant.id},
        headers=headers,
    )
    assert create_order_response.status_code == 201, create_order_response.text
    order = create_order_response.json()
    assert order["status"] == "PENDING"
    assert order["items"][0]["quantity"] == 2

    db_session.refresh(product)
    assert product.stock_quantity == 10

    cart_row = (
        db_session.query(Cart)
        .filter(
            Cart.tenant_id == tenant.id,
            Cart.patient_user_id == user.id,
        )
        .order_by(Cart.id.desc())
        .first()
    )
    assert cart_row is not None
    assert cart_row.status == CartStatus.CONVERTED


def test_cancel_pending_order_restores_stock(commerce_client, db_session):
    tenant = _create_tenant(db_session, "cancel")
    product = _create_product(db_session, tenant.id, stock_quantity=8)
    email = "cart-cancel@example.com"
    password = "Pass1234!"

    _register_client(
        commerce_client,
        db_session,
        tenant.id,
        email=email,
        password=password,
    )
    headers = _login(commerce_client, email, password)
    order_id = _create_order_for_checkout(
        commerce_client,
        headers,
        tenant.id,
        product.product_id,
    )

    db_session.refresh(product)
    assert product.stock_quantity == 7

    cancel_response = commerce_client.patch(
        f"/api/orders/{order_id}/cancel",
        headers=headers,
    )
    assert cancel_response.status_code == 200, cancel_response.text
    assert cancel_response.json()["status"] == "CANCELLED"

    db_session.refresh(product)
    assert product.stock_quantity == 8


def test_payment_webhook_marks_order_as_paid(commerce_client, db_session):
    tenant = _create_tenant(db_session, "paid")
    product = _create_product(db_session, tenant.id, stock_quantity=5)
    email = "cart-paid@example.com"
    password = "Pass1234!"

    _register_client(
        commerce_client,
        db_session,
        tenant.id,
        email=email,
        password=password,
    )
    headers = _login(commerce_client, email, password)
    order_id = _create_order_for_checkout(
        commerce_client,
        headers,
        tenant.id,
        product.product_id,
    )

    checkout_response = commerce_client.post(
        "/api/checkout/initiate",
        json={"order_id": order_id},
        headers={
            **headers,
            "Idempotency-Key": f"commerce-{uuid.uuid4()}",
        },
    )
    assert checkout_response.status_code == 200, checkout_response.text
    checkout_data = checkout_response.json()

    webhook_response = commerce_client.post(
        "/api/checkout/webhook/stripe",
        json={
            "id": "evt_commerce_order_paid",
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": checkout_data["stripe_payment_intent_id"],
                }
            },
        },
        headers={"Stripe-Signature": "t=test,v1=fake"},
    )
    assert webhook_response.status_code == 200, webhook_response.text

    payment = db_session.query(Payment).filter(
        Payment.payment_id == checkout_data["payment_id"]
    ).one()
    order = db_session.query(Order).filter(Order.id == order_id).one()
    assert payment.status.value == "CAPTURED"
    assert order.status == OrderStatus.PAID
