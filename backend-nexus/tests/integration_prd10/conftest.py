"""PRD-10 integration test suite conftest: register marker and expose prd10 fixtures."""

import json
import os
import pytest

pytest_plugins = ["tests.integration_prd10.fixtures"]


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "prd10: PRD-10 checkout initiation and idempotency integration tests."
    )


@pytest.fixture(autouse=True)
def stub_stripe(monkeypatch):
    """
    Stub Stripe SDK calls for integration tests so no external network is required.
    """
    os.environ["STRIPE_SECRET_KEY"] = "sk_test_prd10"
    os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_prd10"
    os.environ.setdefault("STRIPE_CURRENCY", "usd")

    counter = {"value": 0}
    client_secrets: dict[str, str] = {}

    def fake_payment_intent_create(**kwargs):
        counter["value"] += 1
        intent_id = f"pi_test_prd10_{counter['value']}"
        client_secret = f"{intent_id}_secret_test"
        client_secrets[intent_id] = client_secret
        return {"id": intent_id, "client_secret": client_secret}

    def fake_payment_intent_retrieve(intent_id, **kwargs):
        return {
            "id": intent_id,
            "client_secret": client_secrets.get(intent_id, f"{intent_id}_secret_test"),
        }

    def fake_construct_event(payload, sig_header, secret):
        return json.loads(payload.decode("utf-8"))

    monkeypatch.setattr(
        "app.services.payment_service.stripe.PaymentIntent.create",
        fake_payment_intent_create,
    )
    monkeypatch.setattr(
        "app.services.payment_service.stripe.PaymentIntent.retrieve",
        fake_payment_intent_retrieve,
    )
    monkeypatch.setattr(
        "app.services.payment_service.stripe.Webhook.construct_event",
        fake_construct_event,
    )
    return {
        "client_secrets": client_secrets,
        "counter": counter,
    }
