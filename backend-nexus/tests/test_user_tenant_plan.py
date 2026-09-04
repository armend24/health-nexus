"""
Tests for user-tenant-plan APIs.
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth.auth_utils import get_current_user
from app.main import app
from app.models import (
    Enrollment,
    Patient,
    SubscriptionPlan,
    Tenant,
    TenantManager,
    TenantSubscription,
    User,
    UserTenantPlan,
)
from app.models.enrollment import EnrollmentStatus


@pytest.fixture
def client(db_session):
    """TestClient with dependency override and seed helpers."""

    manager_user = User(
        first_name="Manager",
        last_name="User",
        email="manager@test.com",
        password="hashed",
    )
    outsider_user = User(
        first_name="Outsider",
        last_name="User",
        email="outsider@test.com",
        password="hashed",
    )

    tenant = Tenant(
        name="Tenant One",
        email="tenant1@test.com",
        licence_number="TEN-001",
    )
    other_tenant = Tenant(
        name="Tenant Two",
        email="tenant2@test.com",
        licence_number="TEN-002",
    )

    db_session.add_all([manager_user, outsider_user, tenant, other_tenant])
    db_session.flush()

    manager_membership = TenantManager(
        user_id=manager_user.id,
        tenant_id=tenant.id,
    )
    outsider_membership = TenantManager(
        user_id=outsider_user.id,
        tenant_id=other_tenant.id,
    )
    db_session.add_all([manager_membership, outsider_membership])
    db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: {"user_id": manager_user.id}
    try:
        with TestClient(app) as test_client:
            test_client.manager_user_id = manager_user.id
            test_client.outsider_user_id = outsider_user.id
            test_client.tenant_id = tenant.id
            test_client.other_tenant_id = other_tenant.id
            yield test_client
    finally:
        app.dependency_overrides.clear()


def test_create_plan_success(client):
    response = client.post(
        "/user-tenant-plans/",
        json={
            "tenant_id": client.tenant_id,
            "name": "Basic",
            "description": "Starter plan",
            "price": "29.99",
            "duration": 30,
            "max_appointments": 10,
            "max_consultations": 5,
            "is_active": True,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == client.tenant_id
    assert data["name"] == "Basic"
    assert float(data["price"]) == pytest.approx(29.99)


def test_create_plan_for_unmanaged_tenant_returns_403(client):
    response = client.post(
        "/user-tenant-plans/",
        json={
            "tenant_id": client.other_tenant_id,
            "name": "Unauthorized",
            "price": "49.99",
        },
    )

    assert response.status_code == 403
    assert "not authorized" in response.json().get("detail", "").lower()


def test_create_plan_invalid_price_returns_422(client):
    response = client.post(
        "/user-tenant-plans/",
        json={
            "tenant_id": client.tenant_id,
            "name": "Bad Price",
            "price": "-5",
        },
    )

    assert response.status_code == 422


def test_get_pricing_bounds_returns_expected_values(client, db_session):
    # Create base subscription plan
    base_plan = SubscriptionPlan(
        name="PAID",
        price=100,
        duration=30,
    )
    db_session.add(base_plan)
    db_session.flush()

    # Activate tenant subscription
    subscription = TenantSubscription(
        tenant_id=client.tenant_id,
        subscription_plan_id=base_plan.id,
        status="ACTIVE",
        activated_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db_session.add(subscription)
    db_session.commit()

    response = client.get(
        "/user-tenant-plans/pricing-bounds",
        params={"tenant_id": client.tenant_id},
    )

    assert response.status_code == 200

    data = response.json()
    assert data["min_price"] == 5  # 100 * 0.05
    assert data["max_price"] == 35  # 100 * 0.35


def test_create_plan_enforces_tenant_pricing_bounds(client, db_session):
    paid_plan = SubscriptionPlan(name="PAID", price=100, duration=30)
    db_session.add(paid_plan)
    db_session.flush()

    subscription = TenantSubscription(
        tenant_id=client.tenant_id,
        subscription_plan_id=paid_plan.id,
        status="ACTIVE",
        activated_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db_session.add(subscription)
    db_session.commit()

    # For a base price of 100, valid tenant plan price range is [5, 35].
    low = client.post(
        "/user-tenant-plans/",
        json={
            "tenant_id": client.tenant_id,
            "name": "Too Low",
            "price": "4.99",
        },
    )
    assert low.status_code == 400

    high = client.post(
        "/user-tenant-plans/",
        json={
            "tenant_id": client.tenant_id,
            "name": "Too High",
            "price": "35.01",
        },
    )
    assert high.status_code == 400

    ok = client.post(
        "/user-tenant-plans/",
        json={
            "tenant_id": client.tenant_id,
            "name": "In Range",
            "price": "20",
        },
    )
    assert ok.status_code == 200


def test_update_plan_success(client, db_session):
    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Original",
        description="Original description",
        price=19.99,
        duration=15,
        max_appointments=3,
        max_consultations=2,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()

    response = client.put(
        f"/user-tenant-plans/{plan.id}",
        json={"name": "Updated", "duration": 60},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated"
    assert data["duration"] == 60


def test_update_plan_for_other_tenant_returns_403(client, db_session):
    other_plan = UserTenantPlan(
        tenant_id=client.other_tenant_id,
        name="Other Tenant Plan",
        price=20,
        is_active=True,
    )
    db_session.add(other_plan)
    db_session.commit()

    response = client.put(
        f"/user-tenant-plans/{other_plan.id}",
        json={"name": "Should Fail"},
    )

    assert response.status_code == 403


def test_update_plan_enforces_tenant_pricing_bounds(client, db_session):
    paid_plan = SubscriptionPlan(name="PAID", price=100, duration=30)
    db_session.add(paid_plan)
    db_session.flush()

    subscription = TenantSubscription(
        tenant_id=client.tenant_id,
        subscription_plan_id=paid_plan.id,
        status="ACTIVE",
        activated_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db_session.add(subscription)
    db_session.flush()

    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="In Range",
        price=150,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()

    response = client.put(
        f"/user-tenant-plans/{plan.id}",
        json={"price": "49.99"},
    )

    assert response.status_code == 400


def test_get_plan_success(client, db_session):
    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Single",
        price=11,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()

    response = client.get(f"/user-tenant-plans/{plan.id}")

    assert response.status_code == 200
    assert response.json()["id"] == plan.id


def test_get_plans_by_tenant_success(client, db_session):
    p1 = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="A",
        price=10,
        is_active=True,
    )
    p2 = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="B",
        price=20,
        is_active=True,
    )
    db_session.add_all([p1, p2])
    db_session.commit()

    response = client.get(f"/user-tenant-plans/tenant/{client.tenant_id}")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = {item["name"] for item in data}
    assert names == {"A", "B"}


def test_get_plan_for_other_tenant_returns_403(client, db_session):
    other_plan = UserTenantPlan(
        tenant_id=client.other_tenant_id,
        name="Other Tenant Plan",
        price=15,
        is_active=True,
    )
    db_session.add(other_plan)
    db_session.commit()

    response = client.get(f"/user-tenant-plans/{other_plan.id}")

    assert response.status_code == 403


def test_get_plans_by_tenant_requires_auth(client):
    saved = app.dependency_overrides.pop(get_current_user, None)
    try:
        response = client.get(f"/user-tenant-plans/tenant/{client.tenant_id}")
    finally:
        if saved is not None:
            app.dependency_overrides[get_current_user] = saved

    assert response.status_code == 403


def test_get_public_active_plans_without_auth(client, db_session):
    db_session.add_all(
        [
            UserTenantPlan(
                tenant_id=client.tenant_id,
                name="Active Public",
                price=40,
                is_active=True,
            ),
            UserTenantPlan(
                tenant_id=client.tenant_id,
                name="Inactive Hidden",
                price=60,
                is_active=False,
            ),
            UserTenantPlan(
                tenant_id=client.other_tenant_id,
                name="Other Tenant Active",
                price=80,
                is_active=True,
            ),
        ]
    )
    db_session.commit()

    saved = app.dependency_overrides.pop(get_current_user, None)
    try:
        response = client.get(f"/user-tenant-plans/public/tenant/{client.tenant_id}")
    finally:
        if saved is not None:
            app.dependency_overrides[get_current_user] = saved

    assert response.status_code == 200
    data = response.json()
    names = {item["name"] for item in data}
    assert names == {"Active Public"}


def test_get_tenant_enrollments_returns_enriched_details(client, db_session):
    patient_user = User(
        first_name="Ada",
        last_name="Lovelace",
        email="ada@test.com",
        password="hashed",
    )
    db_session.add(patient_user)
    db_session.flush()

    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Premium",
        price=99,
        is_active=True,
    )
    db_session.add(plan)
    db_session.flush()

    db_session.add(Patient(tenant_id=client.tenant_id, user_id=patient_user.id))
    db_session.flush()

    enrollment = Enrollment(
        tenant_id=client.tenant_id,
        patient_user_id=patient_user.id,
        user_tenant_plan_id=plan.id,
        created_by=client.manager_user_id,
        status=EnrollmentStatus.ACTIVE,
        activated_at=datetime.utcnow(),
    )
    db_session.add(enrollment)
    db_session.commit()

    response = client.get(f"/user-tenant-plans/tenant/{client.tenant_id}/enrollments")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    row = data[0]
    assert row["patient_email"] == "ada@test.com"
    assert row["patient_first_name"] == "Ada"
    assert row["patient_last_name"] == "Lovelace"
    assert row["plan_name"] == "Premium"
    assert row["patient_user_id"] == patient_user.id


def test_update_plan_can_toggle_is_active(client, db_session):
    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Toggle Plan",
        price=10,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()

    response = client.put(
        f"/user-tenant-plans/{plan.id}",
        json={"is_active": False},
    )

    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_get_tenant_enrollments_enforces_tenant_isolation(client, db_session):
    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Tenant One Plan",
        price=40,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()

    saved = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: {"user_id": client.outsider_user_id}
    try:
        response = client.get(f"/user-tenant-plans/tenant/{client.tenant_id}/enrollments")
    finally:
        if saved is not None:
            app.dependency_overrides[get_current_user] = saved
        else:
            app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403


def test_enroll_happy_path_creates_enrollment(client, db_session):
    patient_user = User(
        first_name="Client",
        last_name="One",
        email="client.one@test.com",
        password="hashed",
    )
    db_session.add(patient_user)
    db_session.commit()

    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Starter",
        price=35,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()

    saved = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": patient_user.id,
        "role": "CLIENT",
    }
    try:
        response = client.post(
            "/user-tenant-plans/enroll",
            params={"tenant_id": client.tenant_id, "plan_id": plan.id},
        )
    finally:
        if saved is not None:
            app.dependency_overrides[get_current_user] = saved
        else:
            app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == client.tenant_id
    assert data["patient_user_id"] == patient_user.id
    assert data["user_tenant_plan_id"] == plan.id
    assert data["status"] == "PENDING"
    assert data["activated_at"] is None


def test_enroll_returns_404_when_plan_belongs_to_other_tenant(client, db_session):
    patient_user = User(
        first_name="Client",
        last_name="Two",
        email="client.two@test.com",
        password="hashed",
    )
    db_session.add(patient_user)
    db_session.commit()

    other_plan = UserTenantPlan(
        tenant_id=client.other_tenant_id,
        name="Other Tenant Plan",
        price=45,
        is_active=True,
    )
    db_session.add(other_plan)
    db_session.commit()

    saved = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": patient_user.id,
        "role": "CLIENT",
    }
    try:
        response = client.post(
            "/user-tenant-plans/enroll",
            params={"tenant_id": client.tenant_id, "plan_id": other_plan.id},
        )
    finally:
        if saved is not None:
            app.dependency_overrides[get_current_user] = saved
        else:
            app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 404


def test_enroll_returns_404_when_plan_is_inactive(client, db_session):
    patient_user = User(
        first_name="Client",
        last_name="Three",
        email="client.three@test.com",
        password="hashed",
    )
    db_session.add(patient_user)
    db_session.commit()

    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Inactive",
        price=25,
        is_active=False,
    )
    db_session.add(plan)
    db_session.commit()

    saved = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": patient_user.id,
        "role": "CLIENT",
    }
    try:
        response = client.post(
            "/user-tenant-plans/enroll",
            params={"tenant_id": client.tenant_id, "plan_id": plan.id},
        )
    finally:
        if saved is not None:
            app.dependency_overrides[get_current_user] = saved
        else:
            app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 404


def test_enroll_existing_enrollment_switches_plan(client, db_session):
    patient_user = User(
        first_name="Client",
        last_name="Four",
        email="client.four@test.com",
        password="hashed",
    )
    db_session.add(patient_user)
    db_session.commit()

    first_plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="First",
        price=10,
        is_active=True,
    )
    second_plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Second",
        price=20,
        is_active=True,
    )
    db_session.add_all([first_plan, second_plan])
    db_session.commit()

    saved = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": patient_user.id,
        "role": "CLIENT",
    }
    try:
        first = client.post(
            "/user-tenant-plans/enroll",
            params={"tenant_id": client.tenant_id, "plan_id": first_plan.id},
        )
        second = client.post(
            "/user-tenant-plans/enroll",
            params={"tenant_id": client.tenant_id, "plan_id": second_plan.id},
        )
    finally:
        if saved is not None:
            app.dependency_overrides[get_current_user] = saved
        else:
            app.dependency_overrides.pop(get_current_user, None)

    assert first.status_code == 200
    assert second.status_code == 200
    first_data = first.json()
    second_data = second.json()
    assert second_data["id"] == first_data["id"]
    assert second_data["user_tenant_plan_id"] == second_plan.id
    assert second_data["status"] == "PENDING"
    assert second_data["activated_at"] is None


def test_enroll_rejects_non_patient_roles(client, db_session):
    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Role Guard Plan",
        price=25,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()

    # Fixture default is manager-like identity without CLIENT/PATIENT role.
    response = client.post(
        "/user-tenant-plans/enroll",
        params={"tenant_id": client.tenant_id, "plan_id": plan.id},
    )

    assert response.status_code == 403
    assert "only patient users" in response.json()["detail"].lower()


def test_delete_plan_success(client, db_session):
    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Delete me",
        price=9.99,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()

    response = client.delete(f"/user-tenant-plans/{plan.id}")

    assert response.status_code == 200
    assert response.json()["message"] == "Plan deleted successfully"


def test_delete_plan_for_other_tenant_returns_403(client, db_session):
    other_plan = UserTenantPlan(
        tenant_id=client.other_tenant_id,
        name="Other Delete",
        price=9.99,
        is_active=True,
    )
    db_session.add(other_plan)
    db_session.commit()

    response = client.delete(f"/user-tenant-plans/{other_plan.id}")

    assert response.status_code == 403


def test_delete_plan_with_enrollments_returns_409(client, db_session):
    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Protected Delete",
        price=9.99,
        is_active=True,
    )
    db_session.add(plan)
    db_session.flush()

    enrollment = Enrollment(
        tenant_id=client.tenant_id,
        patient_user_id=client.user_id,
        user_tenant_plan_id=plan.id,
        created_by=client.user_id,
        status=EnrollmentStatusModel.PENDING,
    )
    db_session.add(enrollment)
    db_session.commit()

    response = client.delete(f"/user-tenant-plans/{plan.id}")

    assert response.status_code == 200
    assert response.json()["message"] == "Plan archived successfully"

    db_session.refresh(plan)
    assert plan.is_active is False


def test_delete_plan_with_active_enrollments_returns_409(client, db_session):
    plan = UserTenantPlan(
        tenant_id=client.tenant_id,
        name="Active Protected Delete",
        price=9.99,
        is_active=True,
    )
    db_session.add(plan)
    db_session.flush()

    enrollment = Enrollment(
        tenant_id=client.tenant_id,
        patient_user_id=client.user_id,
        user_tenant_plan_id=plan.id,
        created_by=client.user_id,
        status=EnrollmentStatusModel.ACTIVE,
    )
    db_session.add(enrollment)
    db_session.commit()

    response = client.delete(f"/user-tenant-plans/{plan.id}")

    assert response.status_code == 409
    assert "active or pending enrollments" in response.json()["detail"].lower()
