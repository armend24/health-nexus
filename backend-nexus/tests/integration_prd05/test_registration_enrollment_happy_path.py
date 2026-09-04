"""
PRD-05 integration test: Registration and enrollment happy path.
Register client under tenant A, create enrollment, retrieve it, transition PENDING -> ACTIVE,
retrieve status; assert all 200/201 and tenant_id remains consistent.
"""

import pytest

from tests.integration_prd05.fixtures import (
    register_client_via_api,
    login_client,
    create_enrollment_via_api,
    transition_enrollment_via_api,
    get_enrollment_via_api,
    create_tenant_manager_and_login,
)


@pytest.mark.prd05
def test_happy_path_enrollment_lifecycle(
    prd05_client,
    db_session,
    tenant_a,
    plan_tenant_a,
    role_patient,
    role_tenant_manager,
):
    """
    Full happy path: register client -> create enrollment -> retrieve enrollment
    -> valid transition PENDING -> ACTIVE -> retrieve status.
    All responses 200/201; tenant_id consistent throughout.
    """
    tenant_id = tenant_a.id

    # 1. Register client under tenant A (201)
    reg = register_client_via_api(
        prd05_client,
        tenant_id,
        email="happy-path-client@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    assert int(reg.get("tenant_id")) == int(
        tenant_id
    ), "Registration response tenant_id must match tenant A"
    user_id = reg["user_id"]

    # 2. Login and create enrollment (201)
    client_headers = login_client(prd05_client, "happy-path-client@prd05.example.com", "PassPRD05!")
    enrollment_id = create_enrollment_via_api(
        prd05_client,
        tenant_id,
        user_id,
        plan_tenant_a.id,
        client_headers,
    )

    # 3. Retrieve enrollment (200)
    get_resp = get_enrollment_via_api(prd05_client, tenant_id, enrollment_id, client_headers)
    assert get_resp.status_code == 200, (get_resp.status_code, get_resp.text)
    enrollment = get_resp.json()
    # API returns EnrollmentStatusRead (id, status, activated_at, ...); no tenant_id in body.
    # Prove enrollment belongs to tenant_a: list enrollments for tenant_a and assert this id is present.
    list_resp = prd05_client.get(
        f"/api/tenants/{tenant_id}/enrollments",
        headers=client_headers,
    )
    assert list_resp.status_code == 200, (list_resp.status_code, list_resp.text)
    listed_ids = [e["id"] for e in list_resp.json()]
    assert (
        enrollment_id in listed_ids
    ), "Enrollment must appear under tenant A list (tenant consistency)"
    assert enrollment.get("status") == "PENDING", "New enrollment should be PENDING"

    # 4. Valid state transition PENDING -> ACTIVE (200) — requires tenant manager
    manager_headers = create_tenant_manager_and_login(
        prd05_client,
        db_session,
        tenant_id,
        role_tenant_manager,
        email="happy-path-manager@prd05.example.com",
    )
    trans_resp = transition_enrollment_via_api(
        prd05_client, tenant_id, enrollment_id, "ACTIVE", manager_headers
    )
    assert trans_resp.status_code == 200, (trans_resp.status_code, trans_resp.text)
    trans_body = trans_resp.json()
    # Transition returns EnrollmentStatusRead (no tenant_id in body).
    assert trans_body.get("status") == "ACTIVE", "Status after transition must be ACTIVE"

    # 5. Retrieve status (200) — endpoint returns enrollment_id, status, isActive, etc. (no tenant_id in body)
    status_resp = prd05_client.get(
        f"/api/tenants/{tenant_id}/enrollments/{enrollment_id}/status",
        headers=client_headers,
    )
    assert status_resp.status_code == 200, (status_resp.status_code, status_resp.text)
    status_body = status_resp.json()
    assert status_body.get("status") == "ACTIVE", "Retrieved status must be ACTIVE"

    # Final consistency: get enrollment again; prove tenant by listing under tenant_a
    final_get = get_enrollment_via_api(prd05_client, tenant_id, enrollment_id, client_headers)
    assert final_get.status_code == 200, (final_get.status_code, final_get.text)
    final_list = prd05_client.get(
        f"/api/tenants/{tenant_id}/enrollments",
        headers=client_headers,
    )
    assert final_list.status_code == 200, (final_list.status_code, final_list.text)
    assert enrollment_id in [
        e["id"] for e in final_list.json()
    ], "Final enrollment must belong to tenant A"
