"""
Tests for tenant audit log API: GET /audit-logs.
Uses conftest's reset_database and db_session.
Audit logs are created when tenant status is updated.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Tenant, TenantStatus, SubscriptionPlan
from app.auth.auth_utils import get_current_user


def override_user(role: str, tenant_id: int | None = None):
    def _override():
        return {
            "user_id": 1,
            "role": role,
            "tenant_id": tenant_id,
        }

    return _override


@pytest.fixture
def client(db_session):
    """TestClient with FREE subscription plan and a pending tenant."""
    free_plan = SubscriptionPlan(name="FREE", price=0, duration=30)
    db_session.add(free_plan)
    tenant = Tenant(
        name="Audit Test",
        email="audit@test.com",
        licence_number="AUD-001",
        status=TenantStatus.pending,
    )
    db_session.add(tenant)
    db_session.commit()
    yield TestClient(app)


def test_audit_logs_empty_before_status_change(client):
    from app.main import app

    app.dependency_overrides[get_current_user] = override_user("SUPER_ADMIN")

    response = client.get("/audit-logs")
    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "items": [],
        "total": 0,
        "page": 1,
        "page_size": 10,
    }

    app.dependency_overrides = {}


def test_audit_logs_after_status_change(client):
    from app.main import app

    # Act as SUPER_ADMIN
    app.dependency_overrides[get_current_user] = override_user("SUPER_ADMIN")

    create_resp = client.post(
        "/api/public/tenants",
        json={
            "name": "Log Test",
            "email": "log@test.com",
            "licence_number": "LOG-001",
        },
    )
    assert create_resp.status_code == 201
    tenant_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"/api/superadmin/tenants/{tenant_id}/status",
        json={"status": "approved", "reason": "Approved for testing"},
    )
    assert patch_resp.status_code == 200

    response = client.get("/audit-logs")
    assert response.status_code == 200

    payload = response.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 10
    assert payload["total"] >= 1

    logs = payload["items"]
    assert len(logs) >= 1

    status_change = next(
        (l for l in logs if l["event_type"] == "STATUS_CHANGE"),
        None,
    )

    assert status_change is not None
    assert status_change["entity_name"] == "tenant"
    assert status_change["entity_id"] == tenant_id
    assert status_change["old_value"] == {"status": "pending"}
    assert status_change["new_value"] == {"status": "approved"}
    assert status_change["reason"] == "Approved for testing"

    app.dependency_overrides = {}


def test_super_admin_can_get_all_logs(client, db_session):
    from app.main import app

    app.dependency_overrides[get_current_user] = override_user("SUPER_ADMIN")

    response = client.get("/audit-logs")
    assert response.status_code == 200

    app.dependency_overrides = {}


def test_tenant_manager_can_access_own_logs(client, db_session):
    from app.main import app
    from app.models import Tenant, TenantStatus

    tenant = Tenant(
        name="Tenant A",
        email="a@test.com",
        licence_number="TEN-001",
        status=TenantStatus.pending,
    )
    db_session.add(tenant)
    db_session.commit()

    app.dependency_overrides[get_current_user] = override_user(
        "TENANT_MANAGER",
        tenant_id=tenant.id,
    )

    response = client.get(f"/audit-logs/{tenant.id}")
    assert response.status_code == 200

    app.dependency_overrides = {}


def test_tenant_manager_cannot_access_other_tenant_logs(client, db_session):
    from app.main import app
    from app.models import Tenant, TenantStatus

    tenant1 = Tenant(
        name="Tenant A",
        email="a@test.com",
        licence_number="TEN-001",
        status=TenantStatus.pending,
    )

    tenant2 = Tenant(
        name="Tenant B",
        email="b@test.com",
        licence_number="TEN-002",
        status=TenantStatus.pending,
    )

    db_session.add_all([tenant1, tenant2])
    db_session.commit()

    app.dependency_overrides[get_current_user] = override_user(
        "TENANT_MANAGER",
        tenant_id=tenant1.id,
    )

    response = client.get(f"/audit-logs/{tenant2.id}")
    assert response.status_code == 403
    assert response.json()["detail"] == "Tenant managers can only access their own tenant logs"

    app.dependency_overrides = {}


def test_regular_user_cannot_access_audit_logs(client):
    from app.main import app

    app.dependency_overrides[get_current_user] = override_user("USER")

    response = client.get("/audit-logs")
    assert response.status_code == 403

    app.dependency_overrides = {}


def test_tenant_manager_cannot_get_all_logs(client):
    from app.main import app

    app.dependency_overrides[get_current_user] = override_user(
        "TENANT_MANAGER",
        tenant_id=1,
    )

    response = client.get("/audit-logs")
    assert response.status_code == 403

    app.dependency_overrides = {}
