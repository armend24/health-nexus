"""
PRD-05 integration tests: Enrollment transitions.
Ensures invalid enrollment state transitions are rejected and DB state is not corrupted.
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
def test_invalid_transition_active_to_pending_blocked(
    prd05_client,
    db_session,
    tenant_a,
    plan_tenant_a,
    role_patient,
    role_tenant_manager,
):
    """ACTIVE -> PENDING is invalid; expect 400/409 and enrollment remains ACTIVE."""
    reg = register_client_via_api(
        prd05_client,
        tenant_a.id,
        email="active-pending@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    patient_headers = login_client(prd05_client, "active-pending@prd05.example.com", "PassPRD05!")
    enrollment_id = create_enrollment_via_api(
        prd05_client,
        tenant_a.id,
        reg["user_id"],
        plan_tenant_a.id,
        patient_headers,
    )
    manager_headers = create_tenant_manager_and_login(
        prd05_client,
        db_session,
        tenant_a.id,
        role_tenant_manager,
        email="manager-active-pending@prd05.example.com",
    )
    # Drive to ACTIVE (PENDING -> ACTIVE is allowed; only TENANT_MANAGER can transition)
    trans = transition_enrollment_via_api(
        prd05_client, tenant_a.id, enrollment_id, "ACTIVE", manager_headers
    )
    assert trans.status_code == 200, (trans.status_code, trans.text)
    assert trans.json()["status"] == "ACTIVE"

    # Attempt invalid ACTIVE -> PENDING
    resp = transition_enrollment_via_api(
        prd05_client, tenant_a.id, enrollment_id, "PENDING", manager_headers
    )
    assert resp.status_code in (
        400,
        409,
    ), f"Expected 400 or 409, got {resp.status_code}: {resp.text}"

    # DB state not corrupted: enrollment still ACTIVE (can verify with patient or manager)
    get_resp = get_enrollment_via_api(prd05_client, tenant_a.id, enrollment_id, patient_headers)
    assert get_resp.status_code == 200, (get_resp.status_code, get_resp.text)
    assert get_resp.json()["status"] == "ACTIVE"


@pytest.mark.prd05
def test_invalid_transition_cancelled_to_active_blocked(
    prd05_client,
    db_session,
    tenant_a,
    plan_tenant_a,
    role_patient,
    role_tenant_manager,
):
    """CANCELLED -> ACTIVE is invalid; expect 400/409 and enrollment remains CANCELLED."""
    reg = register_client_via_api(
        prd05_client,
        tenant_a.id,
        email="cancelled-active@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    patient_headers = login_client(prd05_client, "cancelled-active@prd05.example.com", "PassPRD05!")
    enrollment_id = create_enrollment_via_api(
        prd05_client,
        tenant_a.id,
        reg["user_id"],
        plan_tenant_a.id,
        patient_headers,
    )
    manager_headers = create_tenant_manager_and_login(
        prd05_client,
        db_session,
        tenant_a.id,
        role_tenant_manager,
        email="manager-cancelled-active@prd05.example.com",
    )
    # PENDING -> ACTIVE
    trans = transition_enrollment_via_api(
        prd05_client, tenant_a.id, enrollment_id, "ACTIVE", manager_headers
    )
    assert trans.status_code == 200, (trans.status_code, trans.text)
    # ACTIVE -> CANCELLED (allowed)
    trans = transition_enrollment_via_api(
        prd05_client, tenant_a.id, enrollment_id, "CANCELLED", manager_headers
    )
    assert trans.status_code == 200, (trans.status_code, trans.text)
    assert trans.json()["status"] == "CANCELLED"

    # Attempt invalid CANCELLED -> ACTIVE
    resp = transition_enrollment_via_api(
        prd05_client, tenant_a.id, enrollment_id, "ACTIVE", manager_headers
    )
    assert resp.status_code in (
        400,
        409,
    ), f"Expected 400 or 409, got {resp.status_code}: {resp.text}"

    # Still CANCELLED
    get_resp = get_enrollment_via_api(prd05_client, tenant_a.id, enrollment_id, patient_headers)
    assert get_resp.status_code == 200, (get_resp.status_code, get_resp.text)
    assert get_resp.json()["status"] == "CANCELLED"


@pytest.mark.prd05
def test_unknown_state_transition_rejected(
    prd05_client,
    db_session,
    tenant_a,
    plan_tenant_a,
    role_patient,
    role_tenant_manager,
):
    """Transition with invalid target_status (e.g. UNKNOWN_STATE) returns 400/422; no state change."""
    reg = register_client_via_api(
        prd05_client,
        tenant_a.id,
        email="unknown-state@prd05.example.com",
        password="PassPRD05!",
        db_session=db_session,
        role=role_patient,
    )
    patient_headers = login_client(prd05_client, "unknown-state@prd05.example.com", "PassPRD05!")
    manager_headers = create_tenant_manager_and_login(
        prd05_client,
        db_session,
        tenant_a.id,
        role_tenant_manager,
        email="manager-unknown-state@prd05.example.com",
    )
    enrollment_id = create_enrollment_via_api(
        prd05_client,
        tenant_a.id,
        reg["user_id"],
        plan_tenant_a.id,
        patient_headers,
    )
    initial_get = get_enrollment_via_api(prd05_client, tenant_a.id, enrollment_id, patient_headers)
    assert initial_get.status_code == 200
    initial_status = initial_get.json()["status"]
    assert initial_status == "PENDING"

    # Attempt transition with invalid state (manager has permission; validation rejects body)
    resp = transition_enrollment_via_api(
        prd05_client, tenant_a.id, enrollment_id, "UNKNOWN_STATE", manager_headers
    )
    assert resp.status_code in (
        400,
        422,
    ), f"Expected 400 or 422, got {resp.status_code}: {resp.text}"

    # No state change
    after_get = get_enrollment_via_api(prd05_client, tenant_a.id, enrollment_id, patient_headers)
    assert after_get.status_code == 200, (after_get.status_code, after_get.text)
    assert after_get.json()["status"] == initial_status
