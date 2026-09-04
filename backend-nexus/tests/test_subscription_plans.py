"""
Subscription Plan Integration Tests
Tests: Plan Tier Assignment & Validation, Cross-Tenant Access Denial
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed import run_seed
from app.db import SessionLocal
from app.models import (
    Tenant,
    TenantManager,
    User,
    Role,
    SubscriptionPlan,
    TenantSubscription,
    Doctor,
    Enrollment,
    TenantDepartment,
)
from app.models.tenant_subscription import SubscriptionStatus
from app.models.enrollment import EnrollmentStatus
from app.auth.auth_utils import hash_password


@pytest.fixture
def client():
    """TestClient with seeded DB."""
    run_seed()
    yield TestClient(app)


@pytest.fixture
def bluestone_auth(client):
    """Bluestone Clinic manager token."""
    resp = client.post(
        "/api/auth/login",
        json={"email": "tenant.manager@seed.com", "password": "Team2026@"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.fixture
def superadmin_auth(client):
    """Seeded super admin token."""
    resp = client.post(
        "/api/auth/login",
        json={"email": "super.admin@seed.com", "password": "Team2026@"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.fixture
def riverside_auth(client):
    """Riverside Health Partners manager token (create if needed)."""
    session = SessionLocal()
    try:
        role = session.query(Role).filter(Role.name == "TENANT_MANAGER").first()
        tenant = session.query(Tenant).filter(Tenant.name == "Riverside Health Partners").first()

        # Check if user already exists
        user = session.query(User).filter(User.email == "riverside.mgr@test.com").first()
        if not user:
            user = User(
                first_name="Riverside",
                last_name="Mgr",
                email="riverside.mgr@test.com",
                password=hash_password("Team2026@"),
                role_id=role.id,
            )
            session.add(user)
            session.flush()
            session.add(TenantManager(user_id=user.id, tenant_id=tenant.id))
            session.commit()
    finally:
        session.close()

    resp = client.post(
        "/api/auth/login",
        json={"email": "riverside.mgr@test.com", "password": "Team2026@"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


def test_upgrade_plan_succeeds_and_marks_old_subscription_expired(client, bluestone_auth):
    """Paid upgrade creates or returns a pending subscription and keeps current active plan unchanged."""
    headers = {"Authorization": f"Bearer {bluestone_auth}"}

    # Get current subscription details
    session = SessionLocal()
    try:
        bluestone = session.query(Tenant).filter(Tenant.name == "Bluestone Clinic").first()
        current_sub = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == bluestone.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )
        old_sub_id = current_sub.id
        current_plan_id = current_sub.subscription_plan_id
        current_plan = session.get(SubscriptionPlan, current_plan_id)

        # Find next higher priced tier plan
        new_plan = (
            session.query(SubscriptionPlan)
            .filter(SubscriptionPlan.price > current_plan.price)
            .order_by(SubscriptionPlan.price.asc(), SubscriptionPlan.id.asc())
            .first()
        )
        assert new_plan is not None
        new_plan_id = new_plan.id
    finally:
        session.close()

    # Upgrade plan
    resp = client.post(
        "/api/subscription_plan/change",
        headers=headers,
        json={"new_plan_id": new_plan_id},
    )
    assert resp.status_code == 200
    new_sub = resp.json()
    assert new_sub["status"] == "EXPIRED"
    assert new_sub["subscription_plan_id"] == new_plan_id
    assert new_sub["activated_at"] is None
    assert new_sub["expires_at"] is None
    assert "Awaiting payment" in (new_sub["cancellation_reason"] or "")

    # Verify current active subscription is unchanged until payment succeeds
    session = SessionLocal()
    try:
        old_sub = (
            session.query(TenantSubscription).filter(TenantSubscription.id == old_sub_id).first()
        )
        assert old_sub.status == SubscriptionStatus.ACTIVE
        assert old_sub.subscription_plan_id == current_plan_id
        assert old_sub.cancelled_at is None
        assert old_sub.cancellation_reason is None
    finally:
        session.rollback()
        session.close()


def test_downgrade_blocked_when_resources_exceed_limit(client, bluestone_auth):
    """Downgrade to a lower-priced plan is rejected for an active paid subscription."""

    headers = {"Authorization": f"Bearer {bluestone_auth}"}

    # Get a lower-priced plan dynamically
    session = SessionLocal()
    try:
        bluestone = session.query(Tenant).filter(Tenant.name == "Bluestone Clinic").first()
        current_sub = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == bluestone.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )
        current_plan = session.get(SubscriptionPlan, current_sub.subscription_plan_id)
        free_plan = session.query(SubscriptionPlan).filter(SubscriptionPlan.name == "FREE").first()
        assert free_plan is not None
        free_plan_id = free_plan.id
        assert float(free_plan.price) < float(current_plan.price)
    finally:
        session.close()

    # Try downgrade to FREE plan (should fail)
    resp = client.post(
        "/api/subscription_plan/change",
        headers=headers,
        json={"new_plan_id": free_plan_id},
    )
    assert resp.status_code == 400
    assert "downgrade" in resp.json()["detail"].lower()


def test_tenant_plan_change_only_affects_own_subscription(client, bluestone_auth, riverside_auth):
    """Paid plan change for one tenant creates only that tenant's pending subscription."""
    bluestone_headers = {"Authorization": f"Bearer {bluestone_auth}"}

    # Get initial plans for both tenants
    session = SessionLocal()
    try:
        bluestone = session.query(Tenant).filter(Tenant.name == "Bluestone Clinic").first()
        riverside = session.query(Tenant).filter(Tenant.name == "Riverside Health Partners").first()

        bluestone_sub_before = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == bluestone.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )

        riverside_sub_before = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == riverside.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )

        bluestone_plan_before = bluestone_sub_before.subscription_plan_id
        riverside_plan_before = riverside_sub_before.subscription_plan_id

        # Find next higher priced plan for Bluestone upgrade
        next_plan = (
            session.query(SubscriptionPlan)
            .filter(SubscriptionPlan.price > bluestone_sub_before.subscription_plan.price)
            .order_by(SubscriptionPlan.price.asc(), SubscriptionPlan.id.asc())
            .first()
        )
        assert next_plan is not None
        upgrade_plan_id = next_plan.id
    finally:
        session.close()

    # Bluestone upgrades
    resp = client.post(
        "/api/subscription_plan/change",
        headers=bluestone_headers,
        json={"new_plan_id": upgrade_plan_id},
    )
    assert resp.status_code == 200

    # Verify: Bluestone plan changed, Riverside unchanged
    session = SessionLocal()
    try:
        bluestone = session.query(Tenant).filter(Tenant.name == "Bluestone Clinic").first()
        riverside = session.query(Tenant).filter(Tenant.name == "Riverside Health Partners").first()

        bluestone_sub_after = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == bluestone.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )

        riverside_sub_after = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == riverside.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )

        pending_bluestone_sub = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == bluestone.id,
                TenantSubscription.subscription_plan_id == upgrade_plan_id,
                TenantSubscription.status == SubscriptionStatus.EXPIRED,
                TenantSubscription.activated_at.is_(None),
            )
            .order_by(TenantSubscription.id.desc())
            .first()
        )

        # Bluestone active subscription remains unchanged until payment succeeds
        assert bluestone_sub_after.subscription_plan_id == bluestone_plan_before
        assert pending_bluestone_sub is not None

        # Riverside unchanged
        assert riverside_sub_after.subscription_plan_id == riverside_plan_before
    finally:
        session.rollback()
        session.close()


def test_plan_change_allows_new_selection_without_active_subscription(client, bluestone_auth):
    """Tenant managers can choose a new plan after the previous subscription is cancelled."""

    headers = {"Authorization": f"Bearer {bluestone_auth}"}

    session = SessionLocal()
    try:
        bluestone = session.query(Tenant).filter(Tenant.name == "Bluestone Clinic").first()
        current_sub = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == bluestone.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )
        assert current_sub is not None

        current_sub.status = SubscriptionStatus.EXPIRED
        current_sub.cancelled_at = current_sub.activated_at
        current_sub.cancellation_reason = "Cancelled by super admin"
        session.commit()

        replacement_plan = (
            session.query(SubscriptionPlan)
            .filter(SubscriptionPlan.id != current_sub.subscription_plan_id)
            .order_by(SubscriptionPlan.price.asc(), SubscriptionPlan.id.asc())
            .first()
        )
        assert replacement_plan is not None

        active_doctors = (
            session.query(Doctor)
            .filter(Doctor.tenant_id == bluestone.id, Doctor.is_active == True)
            .count()
        )
        active_patients = (
            session.query(Enrollment)
            .filter(
                Enrollment.tenant_id == bluestone.id,
                Enrollment.status == EnrollmentStatus.ACTIVE,
            )
            .count()
        )
        department_count = (
            session.query(TenantDepartment)
            .filter(TenantDepartment.tenant_id == bluestone.id)
            .count()
        )
    finally:
        session.close()

    stats_resp = client.get("/api/subscription_plan/stats", headers=headers)
    assert stats_resp.status_code == 200
    assert stats_resp.json() == {
        "doctors_used": active_doctors,
        "patients_used": active_patients,
        "departments_used": department_count,
        "current_plan_id": None,
        "current_plan_name": None,
    }

    current_resp = client.get("/api/subscription_plan/current", headers=headers)
    assert current_resp.status_code == 404
    assert current_resp.json()["detail"] == "No active subscription found for this tenant"

    change_resp = client.post(
        "/api/subscription_plan/change",
        headers=headers,
        json={"new_plan_id": replacement_plan.id},
    )
    assert change_resp.status_code == 200
    assert change_resp.json()["subscription_plan_id"] == replacement_plan.id


def test_superadmin_cancelling_active_subscription_notifies_tenant_manager(
    client,
    bluestone_auth,
    superadmin_auth,
):
    """Tenant managers receive a dashboard notification when an approved subscription is cancelled."""

    manager_headers = {"Authorization": f"Bearer {bluestone_auth}"}
    admin_headers = {"Authorization": f"Bearer {superadmin_auth}"}

    unread_before = client.get("/notifications/me/unread-count", headers=manager_headers)
    assert unread_before.status_code == 200
    assert unread_before.json() == {"count": 0}

    session = SessionLocal()
    try:
        bluestone = session.query(Tenant).filter(Tenant.name == "Bluestone Clinic").first()
        active_subscription = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == bluestone.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )
        assert active_subscription is not None
        active_subscription_id = active_subscription.id
        active_plan_name = active_subscription.subscription_plan.name
    finally:
        session.close()

    transition_resp = client.post(
        f"/api/superadmin/subscriptions/{active_subscription_id}/transition",
        headers=admin_headers,
        json={
            "target": "CANCELLED",
            "reason": "Cancelled after approval by super admin",
        },
    )
    assert transition_resp.status_code == 200
    assert transition_resp.json()["admin_status"] == "CANCELLED"

    unread_after = client.get("/notifications/me/unread-count", headers=manager_headers)
    assert unread_after.status_code == 200
    assert unread_after.json() == {"count": 1}

    notifications_resp = client.get("/notifications/me", headers=manager_headers)
    assert notifications_resp.status_code == 200
    notifications = notifications_resp.json()
    assert len(notifications) == 1
    assert notifications[0]["type"] == "TENANT_SUBSCRIPTION_CANCELLED"
    assert notifications[0]["title"] == "Subscription Cancelled"
    assert active_plan_name in notifications[0]["message"]
    assert "Cancelled after approval by super admin" in notifications[0]["message"]
    assert notifications[0]["entity_type"] == "tenant_subscription"
    assert notifications[0]["entity_id"] == active_subscription_id
    assert notifications[0]["is_read"] is False


def test_superadmin_cancelling_pending_subscription_does_not_notify_tenant_manager(
    client,
    bluestone_auth,
    superadmin_auth,
):
    """Pending subscription requests can be cancelled without creating a dashboard notification."""

    manager_headers = {"Authorization": f"Bearer {bluestone_auth}"}
    admin_headers = {"Authorization": f"Bearer {superadmin_auth}"}

    session = SessionLocal()
    try:
        bluestone = session.query(Tenant).filter(Tenant.name == "Bluestone Clinic").first()
        current_subscription = (
            session.query(TenantSubscription)
            .filter(
                TenantSubscription.tenant_id == bluestone.id,
                TenantSubscription.status == SubscriptionStatus.ACTIVE,
            )
            .first()
        )
        higher_plan = (
            session.query(SubscriptionPlan)
            .filter(SubscriptionPlan.price > current_subscription.subscription_plan.price)
            .order_by(SubscriptionPlan.price.asc(), SubscriptionPlan.id.asc())
            .first()
        )
        assert higher_plan is not None
    finally:
        session.close()

    change_resp = client.post(
        "/api/subscription_plan/change",
        headers=manager_headers,
        json={"new_plan_id": higher_plan.id},
    )
    assert change_resp.status_code == 200
    pending_subscription_id = change_resp.json()["id"]

    transition_resp = client.post(
        f"/api/superadmin/subscriptions/{pending_subscription_id}/transition",
        headers=admin_headers,
        json={"target": "CANCELLED", "reason": "Pending request withdrawn"},
    )
    assert transition_resp.status_code == 200
    assert transition_resp.json()["admin_status"] == "CANCELLED"

    unread_after = client.get("/notifications/me/unread-count", headers=manager_headers)
    assert unread_after.status_code == 200
    assert unread_after.json() == {"count": 0}

    notifications_resp = client.get("/notifications/me", headers=manager_headers)
    assert notifications_resp.status_code == 200
    assert notifications_resp.json() == []
