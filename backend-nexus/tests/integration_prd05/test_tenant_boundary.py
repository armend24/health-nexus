"""
PRD-05 integration tests: Tenant boundary.
Ensures tenants cannot access or modify resources belonging to another tenant.
"""

import pytest

from tests.integration_prd05.fixtures import (
    register_client_via_api,
    login_client,
    create_enrollment_via_api,
)


@pytest.mark.prd05
def test_access_enrollment_from_other_tenant_denied(
    prd05_client,
    db_session,
    tenant_a,
    tenant_b,
    plan_tenant_a,
    role_patient,
):
    """GET enrollment with other tenant's ID is denied (403 or 404)."""
    # Register client under tenant_a and assign PATIENT role
    reg_a = register_client_via_api(
        prd05_client,
        tenant_a.id,
        email="client-a@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    headers_a = login_client(prd05_client, "client-a@prd05.example.com", "PassPRD05!")
    enrollment_id = create_enrollment_via_api(
        prd05_client,
        tenant_a.id,
        reg_a["user_id"],
        plan_tenant_a.id,
        headers_a,
    )

    # Register client under tenant_b to get auth for "tenant_b" context
    register_client_via_api(
        prd05_client,
        tenant_b.id,
        email="client-b@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    headers_b = login_client(prd05_client, "client-b@prd05.example.com", "PassPRD05!")

    # Attempt to read tenant_a's enrollment via tenant_b's URL
    resp = prd05_client.get(
        f"/api/tenants/{tenant_b.id}/enrollments/{enrollment_id}",
        headers=headers_b,
    )
    assert resp.status_code in (
        403,
        404,
    ), f"Expected 403 or 404, got {resp.status_code}: {resp.text}"


@pytest.mark.prd05
def test_transition_enrollment_from_other_tenant_denied(
    prd05_client,
    db_session,
    tenant_a,
    tenant_b,
    plan_tenant_a,
    role_patient,
):
    """POST transition on enrollment with other tenant's ID is denied (403 or 404)."""
    reg_a = register_client_via_api(
        prd05_client,
        tenant_a.id,
        email="client-trans-a@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    headers_a = login_client(prd05_client, "client-trans-a@prd05.example.com", "PassPRD05!")
    enrollment_id = create_enrollment_via_api(
        prd05_client,
        tenant_a.id,
        reg_a["user_id"],
        plan_tenant_a.id,
        headers_a,
    )

    register_client_via_api(
        prd05_client,
        tenant_b.id,
        email="client-trans-b@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    headers_b = login_client(prd05_client, "client-trans-b@prd05.example.com", "PassPRD05!")

    resp = prd05_client.post(
        f"/api/tenants/{tenant_b.id}/enrollments/{enrollment_id}/transition",
        json={"target_status": "ACTIVE"},
        headers=headers_b,
    )
    assert resp.status_code in (
        403,
        404,
    ), f"Expected 403 or 404, got {resp.status_code}: {resp.text}"


@pytest.mark.prd05
def test_status_read_from_other_tenant_denied(
    prd05_client,
    db_session,
    tenant_a,
    tenant_b,
    plan_tenant_a,
    role_patient,
):
    """GET enrollment status with other tenant's ID is denied (403 or 404)."""
    reg_a = register_client_via_api(
        prd05_client,
        tenant_a.id,
        email="client-status-a@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    headers_a = login_client(prd05_client, "client-status-a@prd05.example.com", "PassPRD05!")
    enrollment_id = create_enrollment_via_api(
        prd05_client,
        tenant_a.id,
        reg_a["user_id"],
        plan_tenant_a.id,
        headers_a,
    )

    register_client_via_api(
        prd05_client,
        tenant_b.id,
        email="client-status-b@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    headers_b = login_client(prd05_client, "client-status-b@prd05.example.com", "PassPRD05!")

    resp = prd05_client.get(
        f"/api/tenants/{tenant_b.id}/enrollments/{enrollment_id}/status",
        headers=headers_b,
    )
    assert resp.status_code in (
        403,
        404,
    ), f"Expected 403 or 404, got {resp.status_code}: {resp.text}"
