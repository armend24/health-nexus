"""
Lightweight helper fixtures for PRD-05 integration tests.
Isolated from root tests/conftest; use only within tests/integration_prd05.
"""

import pytest

from app.models import Tenant, TenantStatus, UserTenantPlan, Role, User, TenantManager
from app.auth.auth_utils import hash_password


def _make_get_db_override(session):
    """Return a get_db-style generator that yields the test session (so app never uses SessionLocal)."""

    def overridden_get_db():
        yield session

    return overridden_get_db


@pytest.fixture
def prd05_client(db_session):
    """TestClient with DB session for PRD-05 tests. Overrides app get_db to use fixture db_session."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.db import get_db as app_get_db
    from app.routes.public_tenant import get_db as public_tenant_get_db
    from app.routes.enrollment import get_db as enrollment_get_db

    override = _make_get_db_override(db_session)
    app.dependency_overrides[app_get_db] = override
    app.dependency_overrides[public_tenant_get_db] = override
    app.dependency_overrides[enrollment_get_db] = override
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(app_get_db, None)
        app.dependency_overrides.pop(public_tenant_get_db, None)
        app.dependency_overrides.pop(enrollment_get_db, None)


@pytest.fixture
def role_patient(db_session):
    """Ensure PATIENT role exists so registered clients can act on enrollments."""
    role = db_session.query(Role).filter(Role.name == "PATIENT").first()
    if role is None:
        role = Role(name="PATIENT")
        db_session.add(role)
        db_session.commit()
        db_session.refresh(role)
    return role


@pytest.fixture
def role_tenant_manager(db_session):
    """Ensure TENANT_MANAGER role exists so managers can transition enrollments."""
    role = db_session.query(Role).filter(Role.name == "TENANT_MANAGER").first()
    if role is None:
        role = Role(name="TENANT_MANAGER")
        db_session.add(role)
        db_session.commit()
        db_session.refresh(role)
    return role


@pytest.fixture
def tenant_a(db_session, role_patient):
    """First tenant for cross-tenant tests. Approved, unique email and licence."""
    tenant = Tenant(
        name="PRD05 Tenant A",
        email="prd05-tenant-a@example.com",
        licence_number="PRD05-LIC-A-001",
        status=TenantStatus.approved,
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    return tenant


@pytest.fixture
def tenant_b(db_session, role_patient):
    """Second tenant for cross-tenant tests. Approved, unique email and licence."""
    tenant = Tenant(
        name="PRD05 Tenant B",
        email="prd05-tenant-b@example.com",
        licence_number="PRD05-LIC-B-001",
        status=TenantStatus.approved,
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    return tenant


@pytest.fixture
def plan_tenant_a(db_session, tenant_a):
    """UserTenantPlan for tenant_a so enrollments can be created. duration required for PENDING->ACTIVE."""
    plan = UserTenantPlan(
        tenant_id=tenant_a.id,
        name="PRD05 Plan A",
        price=0,
        duration=30,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    return plan


def register_client_via_api(
    client,
    tenant_id: int,
    email: str,
    password: str = "PassPRD05!",
    first_name: str = "First",
    last_name: str = "Client",
    db_session=None,
    role=None,
):
    """
    Register a client under a tenant via POST /api/public/tenants/{tenant_id}/clients/register.
    Returns response JSON with user_id, patient_id, tenant_id.
    If db_session and role are provided, assigns the role to the user so they can use enrollment APIs.
    """
    payload = {
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "password": password,
    }
    resp = client.post(
        f"/api/public/tenants/{tenant_id}/clients/register",
        json=payload,
    )
    assert resp.status_code == 201, (resp.status_code, resp.text)
    data = resp.json()
    if db_session is not None and role is not None:
        user = db_session.query(User).filter(User.email == email).first()
        if user:
            user.role_id = role.id
            db_session.commit()
    return data


def login_client(client, email: str, password: str):
    """
    Login via POST /api/auth/login. Returns headers dict with Authorization Bearer token.
    """
    resp = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200, (resp.status_code, resp.text)
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_enrollment_via_api(
    client,
    tenant_id: int,
    patient_user_id: int,
    user_tenant_plan_id: int,
    auth_headers: dict,
):
    """
    Create an enrollment via POST /api/tenants/{tenant_id}/enrollments.
    Returns enrollment_id from response.
    """
    resp = client.post(
        f"/api/tenants/{tenant_id}/enrollments",
        json={
            "patient_user_id": patient_user_id,
            "user_tenant_plan_id": user_tenant_plan_id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, (resp.status_code, resp.text)
    return resp.json()["id"]


def transition_enrollment_via_api(
    client,
    tenant_id: int,
    enrollment_id: int,
    target_status: str,
    auth_headers: dict,
    reason: str | None = None,
):
    """
    POST /api/tenants/{tenant_id}/enrollments/{enrollment_id}/transition.
    Returns the response object (caller checks status_code and body).
    """
    body = {"target_status": target_status}
    if reason is not None:
        body["reason"] = reason
    return client.post(
        f"/api/tenants/{tenant_id}/enrollments/{enrollment_id}/transition",
        json=body,
        headers=auth_headers,
    )


def get_enrollment_via_api(client, tenant_id: int, enrollment_id: int, auth_headers: dict):
    """
    GET /api/tenants/{tenant_id}/enrollments/{enrollment_id}.
    Returns response (caller checks status_code and body["status"]).
    """
    return client.get(
        f"/api/tenants/{tenant_id}/enrollments/{enrollment_id}",
        headers=auth_headers,
    )


def create_tenant_manager_and_login(
    client,
    db_session,
    tenant_id: int,
    role_tenant_manager,
    email: str = "manager@prd05.example.com",
    password: str = "PassPRD05!",
):
    """
    Create a User with TENANT_MANAGER role and TenantManager link for the tenant,
    then login and return auth headers. Use these headers for transition (and other mutate) APIs.
    """
    user = db_session.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            email=email,
            password=hash_password(password),
            first_name="Tenant",
            last_name="Manager",
            role_id=role_tenant_manager.id,
        )
        db_session.add(user)
        db_session.flush()
        tm = TenantManager(user_id=user.id, tenant_id=tenant_id)
        db_session.add(tm)
        db_session.commit()
        db_session.refresh(user)
    return login_client(client, email, password)
