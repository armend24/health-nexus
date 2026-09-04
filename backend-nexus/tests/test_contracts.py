"""
Tests for contract APIs: CRUD, transitions, permissions.
"""

from datetime import datetime, timedelta, timezone

# Minimal valid 1x1 PNG (67 bytes)
_MINIMAL_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)

import pytest
from fastapi.testclient import TestClient

from app.auth.auth_utils import get_current_user
from app.main import app
from app.models import (
    Contract,
    ContractStatus,
    Department,
    Doctor,
    Role,
    Tenant,
    TenantDepartment,
    TenantManager,
    User,
)
from app.lib.html_sanitize import sanitize_html
from app.services.contract_service import has_active_contract, has_active_contract_for_doctor


def _add_doctor(
    db_session,
    *,
    user_id: int,
    tenant_id: int,
    tenant_department_id: int,
    **kwargs,
):
    doctor = Doctor(
        user_id=user_id,
        tenant_id=tenant_id,
        tenant_department_id=tenant_department_id,
        **kwargs,
    )
    db_session.add(doctor)
    return doctor


@pytest.fixture
def manager_client(db_session):
    """Tenant manager: can access only their tenant's contracts."""
    role = Role(name="TENANT_MANAGER")
    db_session.add(role)
    db_session.flush()

    manager = User(
        first_name="Manager",
        last_name="User",
        email="manager@contracts.com",
        password="hashed",
        role_id=role.id,
    )
    outsider = User(
        first_name="Outsider",
        last_name="User",
        email="outsider@contracts.com",
        password="hashed",
        role_id=role.id,
    )
    tenant = Tenant(name="T1", email="t1@test.com", licence_number="CT-001")
    other = Tenant(name="T2", email="t2@test.com", licence_number="CT-002")
    department = Department(name="Contracts")

    db_session.add_all([manager, outsider, tenant, other, department])
    db_session.flush()

    tenant_department = TenantDepartment(
        tenant_id=tenant.id,
        department_id=department.id,
        phone_number="123456",
    )
    other_tenant_department = TenantDepartment(
        tenant_id=other.id,
        department_id=department.id,
        phone_number="654321",
    )
    db_session.add_all([tenant_department, other_tenant_department])
    db_session.flush()

    db_session.add(TenantManager(user_id=manager.id, tenant_id=tenant.id))
    db_session.commit()

    def _user():
        return {
            "user_id": manager.id,
            "role": "TENANT_MANAGER",
            "tenant_id": tenant.id,
        }

    app.dependency_overrides[get_current_user] = _user
    with TestClient(app) as c:
        c.manager_id = manager.id
        c.tenant_id = tenant.id
        c.tenant_department_id = tenant_department.id
        c.other_tenant_id = other.id
        c.other_tenant_department_id = other_tenant_department.id
        c.outsider_id = outsider.id
        yield c
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def superadmin_client(db_session):
    """Super admin: can access any tenant's contracts."""
    role = Role(name="SUPER_ADMIN")
    db_session.add(role)
    db_session.flush()

    admin = User(
        first_name="Super",
        last_name="Admin",
        email="admin@contracts.com",
        password="hashed",
        role_id=role.id,
    )
    tenant = Tenant(name="T1", email="t1@test.com", licence_number="CT-001")
    other = Tenant(name="T2", email="t2@test.com", licence_number="CT-002")

    db_session.add_all([admin, tenant, other])
    db_session.commit()

    def _user():
        return {"user_id": admin.id, "role": "SUPER_ADMIN"}

    app.dependency_overrides[get_current_user] = _user
    with TestClient(app) as c:
        c.admin_id = admin.id
        c.tenant_id = tenant.id
        c.other_tenant_id = other.id
        yield c
    app.dependency_overrides.pop(get_current_user, None)


# --- CRUD ---


def test_create_contract_default_draft(manager_client, db_session):
    r = manager_client.post(
        f"/api/tenants/{manager_client.tenant_id}/contracts",
        json={"terms_metadata": {"key": "value"}},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "DRAFT"
    assert data["tenant_id"] == manager_client.tenant_id
    assert data["terms_metadata"] == {"key": "value"}


def test_list_contracts_tenant_manager(manager_client, db_session):
    c1 = Contract(tenant_id=manager_client.tenant_id, status=ContractStatus.DRAFT)
    c2 = Contract(tenant_id=manager_client.tenant_id, status=ContractStatus.DRAFT)
    c3 = Contract(tenant_id=manager_client.other_tenant_id, status=ContractStatus.DRAFT)
    db_session.add_all([c1, c2, c3])
    db_session.commit()

    r = manager_client.get(f"/api/tenants/{manager_client.tenant_id}/contracts")
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert c1.id in ids and c2.id in ids
    assert c3.id not in ids


def test_list_contracts_with_doctor_filter(manager_client, db_session):
    """List contracts filtered by doctor_user_id."""
    doc_user = User(first_name="D", last_name="D", email="d@filter.com", password="x")
    db_session.add(doc_user)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=manager_client.tenant_id,
        tenant_department_id=manager_client.tenant_department_id,
    )
    db_session.commit()

    c1 = Contract(
        tenant_id=manager_client.tenant_id,
        doctor_user_id=doc_user.id,
        status=ContractStatus.DRAFT,
    )
    c2 = Contract(
        tenant_id=manager_client.tenant_id, doctor_user_id=None, status=ContractStatus.DRAFT
    )
    db_session.add_all([c1, c2])
    db_session.commit()

    r = manager_client.get(
        f"/api/tenants/{manager_client.tenant_id}/contracts",
        params={"doctor_user_id": doc_user.id},
    )
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert c1.id in ids
    assert c2.id not in ids


def test_list_contracts_other_tenant_returns_403(manager_client, db_session):
    r = manager_client.get(f"/api/tenants/{manager_client.other_tenant_id}/contracts")
    assert r.status_code == 403


def test_superadmin_can_access_any_tenant(superadmin_client, db_session):
    r = superadmin_client.get(f"/api/tenants/{superadmin_client.other_tenant_id}/contracts")
    assert r.status_code == 200


def test_get_contract_tenant_manager_own(manager_client, db_session):
    c = Contract(tenant_id=manager_client.tenant_id, status=ContractStatus.DRAFT)
    db_session.add(c)
    db_session.commit()

    r = manager_client.get(f"/api/contracts/{c.id}")
    assert r.status_code == 200
    assert r.json()["id"] == c.id


def test_get_contract_not_found_returns_404(manager_client):
    r = manager_client.get("/api/contracts/99999")
    assert r.status_code == 404
    assert "not found" in r.json().get("detail", "").lower()


def test_get_contract_tenant_manager_other_returns_403(manager_client, db_session):
    c = Contract(tenant_id=manager_client.other_tenant_id, status=ContractStatus.DRAFT)
    db_session.add(c)
    db_session.commit()

    r = manager_client.get(f"/api/contracts/{c.id}")
    assert r.status_code == 403


def test_superadmin_can_get_any_contract(superadmin_client, db_session):
    c = Contract(tenant_id=superadmin_client.other_tenant_id, status=ContractStatus.DRAFT)
    db_session.add(c)
    db_session.commit()

    r = superadmin_client.get(f"/api/contracts/{c.id}")
    assert r.status_code == 200


def test_doctor_can_get_own_contract(manager_client, db_session):
    """Doctor can view their own contract."""
    doc_user = User(first_name="D", last_name="D", email="d@own.com", password="x")
    db_session.add(doc_user)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=manager_client.tenant_id,
        tenant_department_id=manager_client.tenant_department_id,
    )
    db_session.commit()

    c = Contract(
        tenant_id=manager_client.tenant_id,
        doctor_user_id=doc_user.id,
        status=ContractStatus.DRAFT,
    )
    db_session.add(c)
    db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: {"user_id": doc_user.id, "role": "DOCTOR"}
    try:
        r = manager_client.get(f"/api/contracts/{c.id}")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert r.status_code == 200
    assert r.json()["id"] == c.id


def test_patch_contract_updates_metadata(manager_client, db_session):
    c = Contract(
        tenant_id=manager_client.tenant_id,
        status=ContractStatus.DRAFT,
        terms_metadata={"a": 1},
    )
    db_session.add(c)
    db_session.commit()

    r = manager_client.patch(
        f"/api/contracts/{c.id}",
        json={"terms_metadata": {"b": 2}},
    )
    assert r.status_code == 200
    assert r.json()["terms_metadata"] == {"b": 2}


def test_patch_contract_updates_salary_dates_terms(manager_client, db_session):
    now = datetime.now(timezone.utc)
    c = Contract(
        tenant_id=manager_client.tenant_id,
        status=ContractStatus.DRAFT,
        salary=50000,
        start_date=now,
        end_date=now + timedelta(days=365),
    )
    db_session.add(c)
    db_session.commit()

    new_start = (now + timedelta(days=7)).isoformat().replace("+00:00", "Z")
    new_end = (now + timedelta(days=400)).isoformat().replace("+00:00", "Z")
    r = manager_client.patch(
        f"/api/contracts/{c.id}",
        json={
            "salary": "90000",
            "start_date": new_start,
            "end_date": new_end,
            "terms_content": "<p>Updated terms</p>",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert float(data["salary"]) == 90000
    assert "Updated terms" in data["terms_content"]


# --- Transitions ---


def test_transition_draft_to_active_success(manager_client, db_session):
    c = Contract(tenant_id=manager_client.tenant_id, status=ContractStatus.DRAFT)
    db_session.add(c)
    db_session.commit()

    r = manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "ACTIVE"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ACTIVE"
    assert data["activated_at"] is not None

    db_session.refresh(c)
    assert c.activated_at is not None


def test_transition_draft_to_terminated_requires_reason(manager_client, db_session):
    c = Contract(tenant_id=manager_client.tenant_id, status=ContractStatus.DRAFT)
    db_session.add(c)
    db_session.commit()

    r = manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "TERMINATED"},
    )
    assert r.status_code == 400
    assert "reason" in r.json().get("detail", "").lower()


def test_transition_draft_to_terminated_with_reason_success(manager_client, db_session):
    c = Contract(tenant_id=manager_client.tenant_id, status=ContractStatus.DRAFT)
    db_session.add(c)
    db_session.commit()

    r = manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "TERMINATED", "reason": "Cancelled by client"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "TERMINATED"
    assert r.json().get("terminated_reason") == "Cancelled by client"


def test_transition_invalid_status_rejected(manager_client, db_session):
    """Invalid status string fails validation (422 from Pydantic)."""
    c = Contract(tenant_id=manager_client.tenant_id, status=ContractStatus.DRAFT)
    db_session.add(c)
    db_session.commit()

    r = manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "INVALID_STATUS"},
    )
    assert r.status_code in (400, 422)


def test_transition_invalid_draft_to_expired_rejected(manager_client, db_session):
    c = Contract(tenant_id=manager_client.tenant_id, status=ContractStatus.DRAFT)
    db_session.add(c)
    db_session.commit()

    r = manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "EXPIRED"},
    )
    assert r.status_code == 400
    assert (
        "invalid" in r.json().get("detail", "").lower()
        or "transition" in r.json().get("detail", "").lower()
    )


def test_transition_active_to_expired_success(manager_client, db_session):
    now = datetime.now(timezone.utc)
    c = Contract(
        tenant_id=manager_client.tenant_id,
        status=ContractStatus.ACTIVE,
        activated_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=30),
    )
    db_session.add(c)
    db_session.commit()

    r = manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "EXPIRED"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "EXPIRED"


def test_transition_active_to_terminated_with_reason_success(manager_client, db_session):
    now = datetime.now(timezone.utc)
    c = Contract(
        tenant_id=manager_client.tenant_id,
        status=ContractStatus.ACTIVE,
        activated_at=now - timedelta(days=1),
    )
    db_session.add(c)
    db_session.commit()

    r = manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "TERMINATED", "reason": "Contract ended by mutual agreement"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "TERMINATED"
    assert r.json().get("terminated_reason") == "Contract ended by mutual agreement"


def test_transition_active_to_terminated_requires_reason(manager_client, db_session):
    now = datetime.now(timezone.utc)
    c = Contract(
        tenant_id=manager_client.tenant_id,
        status=ContractStatus.ACTIVE,
        activated_at=now - timedelta(days=1),
    )
    db_session.add(c)
    db_session.commit()

    r = manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "TERMINATED"},
    )
    assert r.status_code == 400
    assert "reason" in r.json().get("detail", "").lower()


def test_transition_date_validation_expires_before_activated(manager_client, db_session):
    now = datetime.now(timezone.utc)
    c = Contract(
        tenant_id=manager_client.tenant_id,
        status=ContractStatus.DRAFT,
        activated_at=None,
        expires_at=now - timedelta(days=1),
    )
    db_session.add(c)
    db_session.commit()

    r = manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "ACTIVE"},
    )
    assert r.status_code == 400
    assert (
        "activated_at" in r.json().get("detail", "").lower()
        or "expires" in r.json().get("detail", "").lower()
    )


def test_transition_expired_to_any_rejected(manager_client, db_session):
    """EXPIRED → ACTIVE/EXPIRED/TERMINATED all rejected (no transitions from EXPIRED)."""
    now = datetime.now(timezone.utc)
    c = Contract(
        tenant_id=manager_client.tenant_id,
        status=ContractStatus.EXPIRED,
        activated_at=now - timedelta(days=10),
        expires_at=now - timedelta(days=1),
    )
    db_session.add(c)
    db_session.commit()

    # ACTIVE, TERMINATED fail transition validation (400)
    for next_status in ["ACTIVE", "TERMINATED"]:
        r = manager_client.post(
            f"/api/contracts/{c.id}/transition",
            json=(
                {"next_status": next_status}
                if next_status != "TERMINATED"
                else {"next_status": "TERMINATED", "reason": "x"}
            ),
        )
        assert r.status_code == 400, f"EXPIRED -> {next_status} should be rejected"


def test_transition_creates_audit_log(manager_client, db_session):
    c = Contract(tenant_id=manager_client.tenant_id, status=ContractStatus.DRAFT)
    db_session.add(c)
    db_session.commit()

    manager_client.post(
        f"/api/contracts/{c.id}/transition",
        json={"next_status": "ACTIVE"},
    )

    r = manager_client.get(f"/audit-logs/{manager_client.tenant_id}")
    assert r.status_code == 200
    logs = [x for x in r.json()["items"] if x.get("entity_name") == "contract"]
    assert len(logs) >= 1
    log = next(l for l in logs if l.get("entity_id") == c.id)
    assert log["old_value"] == {"status": "DRAFT"}
    assert log["new_value"] == {"status": "ACTIVE"}


def test_has_active_contract_helper(db_session):
    """Booking eligibility: has_active_contract returns True only for active, valid-date contracts."""
    now = datetime.now(timezone.utc)
    tenant = Tenant(name="T", email="t@test.com", licence_number="HAC-001")
    other = Tenant(name="O", email="o@test.com", licence_number="HAC-002")
    db_session.add_all([tenant, other])
    db_session.flush()

    # No contracts
    assert has_active_contract(db_session, tenant.id) is False

    # DRAFT - not active
    c1 = Contract(tenant_id=tenant.id, status=ContractStatus.DRAFT)
    db_session.add(c1)
    db_session.commit()
    assert has_active_contract(db_session, tenant.id) is False

    # ACTIVE, activated in past, no expiry
    c2 = Contract(
        tenant_id=tenant.id,
        status=ContractStatus.ACTIVE,
        activated_at=now - timedelta(days=1),
        expires_at=None,
    )
    db_session.add(c2)
    db_session.commit()
    assert has_active_contract(db_session, tenant.id) is True

    # ACTIVE but expires in past - should not count
    db_session.delete(c2)
    c3 = Contract(
        tenant_id=tenant.id,
        status=ContractStatus.ACTIVE,
        activated_at=now - timedelta(days=10),
        expires_at=now - timedelta(days=1),
    )
    db_session.add(c3)
    db_session.commit()
    assert has_active_contract(db_session, tenant.id) is False

    # ACTIVE, expires in future - should count
    db_session.delete(c3)
    c4 = Contract(
        tenant_id=tenant.id,
        status=ContractStatus.ACTIVE,
        activated_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=30),
    )
    db_session.add(c4)
    db_session.commit()
    assert has_active_contract(db_session, tenant.id) is True

    # Other tenant has no active contract
    assert has_active_contract(db_session, other.id) is False


def test_terms_content_sanitized(manager_client, db_session):
    """XSS: script and dangerous HTML in terms_content are stripped."""
    doc_user = User(first_name="D", last_name="D", email="d@sanitize.com", password="x")
    db_session.add(doc_user)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=manager_client.tenant_id,
        tenant_department_id=manager_client.tenant_department_id,
    )
    db_session.commit()

    r = manager_client.post(
        f"/api/tenants/{manager_client.tenant_id}/contracts",
        json={
            "doctor_user_id": doc_user.id,
            "terms_content": '<p>Safe</p><script>alert("xss")</script><img onerror="evil()" src=x>',
        },
    )
    assert r.status_code == 201
    content = r.json()["terms_content"]
    assert "Safe" in content
    assert "script" not in content.lower()
    assert "onerror" not in content.lower()


def test_create_contract_doctor_from_other_tenant_returns_400(manager_client, db_session):
    """Doctor must belong to the tenant."""
    doc_user = User(first_name="D", last_name="D", email="d@other.com", password="x")
    db_session.add(doc_user)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=manager_client.other_tenant_id,
        tenant_department_id=manager_client.other_tenant_department_id,
    )
    db_session.commit()

    r = manager_client.post(
        f"/api/tenants/{manager_client.tenant_id}/contracts",
        json={"doctor_user_id": doc_user.id},
    )
    assert r.status_code == 400
    assert "not found" in r.json().get("detail", "").lower()


def test_create_contract_with_doctor(manager_client, db_session):
    """Create contract linked to a doctor."""
    doc_user = User(first_name="Doc", last_name="User", email="doc@test.com", password="hashed")
    db_session.add(doc_user)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=manager_client.tenant_id,
        tenant_department_id=manager_client.tenant_department_id,
        specialization="GP",
    )
    db_session.commit()

    r = manager_client.post(
        f"/api/tenants/{manager_client.tenant_id}/contracts",
        json={
            "doctor_user_id": doc_user.id,
            "salary": "75000",
            "terms_content": "<p>Employment terms</p>",
            "start_date": "2026-01-01T00:00:00Z",
            "end_date": "2026-12-31T23:59:59Z",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["doctor_user_id"] == doc_user.id
    assert float(data["salary"]) == 75000
    assert "Employment terms" in data["terms_content"]


def test_sign_doctor_and_hospital(manager_client, db_session):
    """Doctor signs, then hospital signs."""
    doc_user = User(first_name="Doc", last_name="User", email="doc2@test.com", password="hashed")
    db_session.add(doc_user)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=manager_client.tenant_id,
        tenant_department_id=manager_client.tenant_department_id,
    )
    db_session.commit()

    c = Contract(
        tenant_id=manager_client.tenant_id,
        doctor_user_id=doc_user.id,
        status=ContractStatus.DRAFT,
    )
    db_session.add(c)
    db_session.commit()

    # Doctor signs with multipart image upload
    prev = app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": doc_user.id, "role": "DOCTOR"}
    try:
        r_doc = manager_client.post(
            f"/api/contracts/{c.id}/sign/doctor",
            files={"signature": ("signature.png", _MINIMAL_PNG, "image/png")},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        if prev is not None:
            app.dependency_overrides[get_current_user] = prev
    assert r_doc.status_code == 200
    assert r_doc.json()["doctor_signed_at"] is not None
    sig = r_doc.json()["doctor_signature"]
    assert sig and (
        sig.startswith("/api/contracts/")
        or sig.startswith("/uploads/")
        or "uploads" in sig
        or sig.startswith("data:image/")
    )

    # Hospital signs with multipart image upload
    r_hosp = manager_client.post(
        f"/api/contracts/{c.id}/sign/hospital",
        files={"signature": ("signature.png", _MINIMAL_PNG, "image/png")},
    )
    assert r_hosp.status_code == 200
    assert r_hosp.json()["hospital_signed_at"] is not None
    hosp_sig = r_hosp.json()["hospital_signature"]
    assert hosp_sig and (
        hosp_sig.startswith("/api/contracts/")
        or hosp_sig.startswith("/uploads/")
        or "uploads" in hosp_sig
        or hosp_sig.startswith("data:image/")
    )

    # Signature images: serve via /api/contracts/{id}/signature/doctor (auth-protected)
    r_sig = manager_client.get(f"/api/contracts/{c.id}/signature/doctor")
    assert r_sig.status_code == 200
    assert r_sig.headers.get("content-type", "").startswith("image/")
    assert len(r_sig.content) == len(_MINIMAL_PNG)

    # Doctor can also fetch their own signature
    app.dependency_overrides[get_current_user] = lambda: {"user_id": doc_user.id, "role": "DOCTOR"}
    try:
        r_doc_sig = manager_client.get(f"/api/contracts/{c.id}/signature/doctor")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert r_doc_sig.status_code == 200


def test_sign_doctor_empty_file_rejected(manager_client, db_session):
    doc_user = User(first_name="D", last_name="D", email="d@empty.com", password="x")
    db_session.add(doc_user)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=manager_client.tenant_id,
        tenant_department_id=manager_client.tenant_department_id,
    )
    db_session.commit()
    c = Contract(
        tenant_id=manager_client.tenant_id,
        doctor_user_id=doc_user.id,
        status=ContractStatus.DRAFT,
    )
    db_session.add(c)
    db_session.commit()

    prev = app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": doc_user.id, "role": "DOCTOR"}
    try:
        r = manager_client.post(
            f"/api/contracts/{c.id}/sign/doctor",
            files={"signature": ("empty.png", b"", "image/png")},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        if prev is not None:
            app.dependency_overrides[get_current_user] = prev
    assert r.status_code == 400


def test_sign_doctor_wrong_content_type_rejected(manager_client, db_session):
    doc_user = User(first_name="D", last_name="D", email="d@type.com", password="x")
    db_session.add(doc_user)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=manager_client.tenant_id,
        tenant_department_id=manager_client.tenant_department_id,
    )
    db_session.commit()
    c = Contract(
        tenant_id=manager_client.tenant_id,
        doctor_user_id=doc_user.id,
        status=ContractStatus.DRAFT,
    )
    db_session.add(c)
    db_session.commit()

    prev = app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": doc_user.id, "role": "DOCTOR"}
    try:
        r = manager_client.post(
            f"/api/contracts/{c.id}/sign/doctor",
            files={"signature": ("doc.pdf", _MINIMAL_PNG, "application/pdf")},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        if prev is not None:
            app.dependency_overrides[get_current_user] = prev
    assert r.status_code == 400
    assert (
        "png" in r.json().get("detail", "").lower() or "jpeg" in r.json().get("detail", "").lower()
    )


def test_sign_doctor_wrong_user_rejected(manager_client, db_session):
    """Only the contract's doctor can sign."""
    doc_user = User(first_name="Doc", last_name="User", email="doc3@test.com", password="hashed")
    db_session.add(doc_user)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=manager_client.tenant_id,
        tenant_department_id=manager_client.tenant_department_id,
    )
    db_session.commit()

    c = Contract(
        tenant_id=manager_client.tenant_id,
        doctor_user_id=doc_user.id,
        status=ContractStatus.DRAFT,
    )
    db_session.add(c)
    db_session.commit()

    # Manager tries to sign as doctor - fails (manager is not the doctor)
    r = manager_client.post(
        f"/api/contracts/{c.id}/sign/doctor",
        files={"signature": ("sig.png", _MINIMAL_PNG, "image/png")},
    )
    assert r.status_code == 403


def test_has_active_contract_for_doctor(db_session):
    """Booking: doctor has active contract when status ACTIVE and dates valid."""
    tenant = Tenant(name="T", email="t2@test.com", licence_number="HAC2-001")
    department = Department(name="Contract Helper")
    doc_user = User(first_name="D", last_name="D", email="d@test.com", password="x")
    db_session.add_all([tenant, department, doc_user])
    db_session.flush()
    tenant_department = TenantDepartment(
        tenant_id=tenant.id,
        department_id=department.id,
        phone_number="111222",
    )
    db_session.add(tenant_department)
    db_session.flush()
    _add_doctor(
        db_session,
        user_id=doc_user.id,
        tenant_id=tenant.id,
        tenant_department_id=tenant_department.id,
    )
    db_session.commit()

    now = datetime.now(timezone.utc)
    assert has_active_contract_for_doctor(db_session, doc_user.id) is False

    c = Contract(
        tenant_id=tenant.id,
        doctor_user_id=doc_user.id,
        status=ContractStatus.ACTIVE,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
    )
    db_session.add(c)
    db_session.commit()
    assert has_active_contract_for_doctor(db_session, doc_user.id) is True

    c.end_date = now - timedelta(days=1)
    db_session.commit()
    assert has_active_contract_for_doctor(db_session, doc_user.id) is False
