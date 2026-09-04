"""
PRD-05 T3-3: Duplicate registration tests.
- Same tenant + same email -> 409 with duplicate/conflict message.
- Same email across different tenants -> 201 or 409 depending on global vs tenant-scoped uniqueness.
"""

import pytest

from tests.integration_prd05.fixtures import register_client_via_api


def _registration_payload(
    email: str, first_name: str = "First", last_name: str = "Client", password: str = "PassPRD05!"
):
    return {
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "password": password,
    }


@pytest.mark.prd05
def test_duplicate_client_registration_same_tenant_returns_409(
    prd05_client,
    tenant_a,
):
    """
    Register client under tenant_a with a fixed email -> 201.
    Register again under same tenant_a with same email -> 409.
    Response message must indicate duplicate/conflict (contains 'duplicate' or 'already').
    """
    email = "dup@prd05.example.com"
    tenant_id = tenant_a.id

    # First registration -> 201
    register_client_via_api(
        prd05_client,
        tenant_id,
        email=email,
        password="PassPRD05!",
        first_name="Dup",
        last_name="Client",
    )

    # Second registration same tenant + same email -> 409
    payload = _registration_payload(email, first_name="Dup", last_name="Client")
    resp = prd05_client.post(
        f"/api/public/tenants/{tenant_id}/clients/register",
        json=payload,
    )
    assert resp.status_code == 409, (resp.status_code, resp.text)

    # Loose assertion: message indicates duplicate/conflict
    body = resp.json()
    detail = body.get("detail")
    if isinstance(detail, dict):
        msg = detail.get("message", "")
    else:
        msg = str(detail or "")
    assert (
        "duplicate" in msg.lower() or "already" in msg.lower()
    ), f"Expected duplicate/conflict message, got: {msg!r}"


@pytest.mark.prd05
def test_same_email_across_different_tenants_is_allowed_or_returns_defined_error(
    prd05_client,
    tenant_a,
    tenant_b,
):
    """
    Register under tenant_a with shared@prd05.example.com -> 201.
    Register under tenant_b with the SAME email:
    - If system uses GLOBAL unique email: second request returns 409.
    - If system uses TENANT-SCOPED unique email: second request returns 201
      (same user may have one registration per tenant).
    This test is robust: we accept either 201 or 409 and document current behavior.
    """
    email = "shared@prd05.example.com"
    payload = _registration_payload(email, first_name="Shared", last_name="User")

    # First registration under tenant_a -> 201
    resp_a = prd05_client.post(
        f"/api/public/tenants/{tenant_a.id}/clients/register",
        json=payload,
    )
    assert resp_a.status_code == 201, (resp_a.status_code, resp_a.text)

    # Second registration under tenant_b with same email
    resp_b = prd05_client.post(
        f"/api/public/tenants/{tenant_b.id}/clients/register",
        json=payload,
    )
    # Accept either: 201 (tenant-scoped uniqueness) or 409 (global uniqueness)
    assert resp_b.status_code in (
        201,
        409,
    ), f"Expected 201 or 409, got {resp_b.status_code}: {resp_b.text}"
    # Current system behavior: email is globally unique for User, but registration
    # (Patient) is per-tenant. So the same email can register in a second tenant
    # (reusing the same User, creating a second Patient) -> 201. If the product
    # later enforces one account per email across all tenants, the second call
    # would return 409.
