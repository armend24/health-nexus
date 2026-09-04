"""
Tests for the Feature Flag Engine (FUL-278).

Covers:
  - resolve_flag() when a tenant override exists (override wins)
  - resolve_flag() when no override exists (falls back to plan default)
  - Cross-tier behavior (feature enabled on pro, disabled on free)
  - Disabled feature → resolve_flag() returns False (access denied)
  - Admin API endpoints (CRUD for defaults and overrides)
  - Evaluate endpoint returns correct enabled value
"""

from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient

from app.auth.auth_utils import get_current_user
from app.main import app
from app.lib.feature_flag_seed import SEED_FEATURE_FLAGS
from app.models import (
    FeatureFlag,
    SubscriptionPlan,
    Tenant,
    TenantSubscription,
    User,
)
from app.models.tenant_subscription import SubscriptionStatus
from app.services.feature_flag_engine import resolve_flag

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _make_tenant(db, name="Test Clinic", licence="LIC-001"):
    tenant = Tenant(name=name, email=f"{name}@test.com", licence_number=licence)
    db.add(tenant)
    db.flush()
    return tenant


def _make_plan(db, name="pro", price=100.0):
    plan = SubscriptionPlan(name=name, price=price, duration=30)
    db.add(plan)
    db.flush()
    return plan


def _subscribe(db, tenant, plan):
    sub = TenantSubscription(
        tenant_id=tenant.id,
        subscription_plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
    )
    db.add(sub)
    db.flush()
    return sub


def _plan_default(db, plan_tier, feature_key, enabled):
    flag = FeatureFlag(
        tenant_id=None, plan_tier=plan_tier, feature_key=feature_key, enabled=enabled
    )
    db.add(flag)
    db.flush()
    return flag


def _tenant_override(db, tenant_id, feature_key, enabled):
    flag = FeatureFlag(
        tenant_id=tenant_id, plan_tier=None, feature_key=feature_key, enabled=enabled
    )
    db.add(flag)
    db.flush()
    return flag


# ---------------------------------------------------------------------------
# Unit tests for resolve_flag()
# ---------------------------------------------------------------------------


class TestResolveFlagEngine:
    def test_tenant_override_takes_priority_over_plan_default(self, db_session):
        """When both an override and a plan default exist, the override wins."""
        tenant = _make_tenant(db_session)
        plan = _make_plan(db_session, name="pro")
        _subscribe(db_session, tenant, plan)

        # Plan default says disabled
        _plan_default(db_session, "pro", "advanced_reports", False)
        # Tenant override says enabled
        _tenant_override(db_session, tenant.id, "advanced_reports", True)

        assert resolve_flag(db_session, tenant.id, "advanced_reports") is True

    def test_plan_default_used_when_no_override(self, db_session):
        """When no tenant override exists, the plan default is used."""
        tenant = _make_tenant(db_session)
        plan = _make_plan(db_session, name="pro")
        _subscribe(db_session, tenant, plan)
        _plan_default(db_session, "pro", "telemedicine", True)

        assert resolve_flag(db_session, tenant.id, "telemedicine") is True

    def test_fallback_false_when_no_flag_configured(self, db_session):
        """Unknown feature keys default to False (deny)."""
        tenant = _make_tenant(db_session)
        plan = _make_plan(db_session, name="pro")
        _subscribe(db_session, tenant, plan)

        assert resolve_flag(db_session, tenant.id, "nonexistent_feature") is False

    def test_fallback_false_when_no_subscription(self, db_session):
        """Tenant with no active subscription gets False (even if plan default exists)."""
        tenant = _make_tenant(db_session)
        _plan_default(db_session, "pro", "advanced_reports", True)

        assert resolve_flag(db_session, tenant.id, "advanced_reports") is False

    def test_fallback_false_when_plan_has_no_default_for_feature(self, db_session):
        """Missing plan-level config for a known feature must deny by default."""
        tenant = _make_tenant(db_session)
        plan = _make_plan(db_session, name="pro")
        _subscribe(db_session, tenant, plan)
        _plan_default(db_session, "pro", "telemedicine", True)

        assert resolve_flag(db_session, tenant.id, "advanced_reports") is False

    def test_fallback_false_when_subscription_is_expired(self, db_session):
        """Inactive subscriptions must not unlock plan defaults."""
        tenant = _make_tenant(db_session)
        plan = _make_plan(db_session, name="pro")
        db_session.add(
            TenantSubscription(
                tenant_id=tenant.id,
                subscription_plan_id=plan.id,
                status=SubscriptionStatus.EXPIRED,
            )
        )
        _plan_default(db_session, "pro", "basic_appointments", True)
        db_session.flush()

        assert resolve_flag(db_session, tenant.id, "basic_appointments") is False

    def test_cross_tier_pro_enabled_free_disabled(self, db_session):
        """Feature enabled on pro but disabled on free: correct per-tier resolution."""
        pro_tenant = _make_tenant(db_session, name="Pro Clinic", licence="LIC-PRO")
        free_tenant = _make_tenant(db_session, name="Free Clinic", licence="LIC-FREE")

        pro_plan = _make_plan(db_session, name="pro")
        free_plan = _make_plan(db_session, name="free", price=0.0)

        _subscribe(db_session, pro_tenant, pro_plan)
        _subscribe(db_session, free_tenant, free_plan)

        _plan_default(db_session, "pro", "bulk_export", True)
        _plan_default(db_session, "free", "bulk_export", False)

        assert resolve_flag(db_session, pro_tenant.id, "bulk_export") is True
        assert resolve_flag(db_session, free_tenant.id, "bulk_export") is False

    def test_cross_tier_feature_only_on_enterprise(self, db_session):
        """Feature enabled only on enterprise, not on pro or free."""
        ent_tenant = _make_tenant(db_session, name="Ent Clinic", licence="LIC-ENT")
        pro_tenant = _make_tenant(db_session, name="Pro Clinic", licence="LIC-PRO")

        ent_plan = _make_plan(db_session, name="enterprise", price=500.0)
        pro_plan = _make_plan(db_session, name="pro", price=100.0)

        _subscribe(db_session, ent_tenant, ent_plan)
        _subscribe(db_session, pro_tenant, pro_plan)

        _plan_default(db_session, "enterprise", "ai_insights", True)
        _plan_default(db_session, "pro", "ai_insights", False)

        assert resolve_flag(db_session, ent_tenant.id, "ai_insights") is True
        assert resolve_flag(db_session, pro_tenant.id, "ai_insights") is False

    def test_disabled_feature_returns_false(self, db_session):
        """A flag explicitly set to disabled returns False (access denied)."""
        tenant = _make_tenant(db_session)
        plan = _make_plan(db_session, name="pro")
        _subscribe(db_session, tenant, plan)
        _plan_default(db_session, "pro", "legacy_api", False)

        assert resolve_flag(db_session, tenant.id, "legacy_api") is False

    def test_override_disabled_overrides_enabled_plan_default(self, db_session):
        """A tenant can be blocked from a feature even if their plan tier allows it."""
        tenant = _make_tenant(db_session)
        plan = _make_plan(db_session, name="pro")
        _subscribe(db_session, tenant, plan)

        _plan_default(db_session, "pro", "advanced_reports", True)
        _tenant_override(db_session, tenant.id, "advanced_reports", False)

        assert resolve_flag(db_session, tenant.id, "advanced_reports") is False

    def test_tenant_override_does_not_leak_to_other_tenants(self, db_session):
        """Per-tenant overrides are isolated even when tenants share the same plan."""
        tenant_a = _make_tenant(db_session, name="Tenant A", licence="LIC-A")
        tenant_b = _make_tenant(db_session, name="Tenant B", licence="LIC-B")
        plan = _make_plan(db_session, name="pro")
        _subscribe(db_session, tenant_a, plan)
        _subscribe(db_session, tenant_b, plan)

        _plan_default(db_session, "pro", "advanced_reports", True)
        _tenant_override(db_session, tenant_a.id, "advanced_reports", False)

        assert resolve_flag(db_session, tenant_a.id, "advanced_reports") is False
        assert resolve_flag(db_session, tenant_b.id, "advanced_reports") is True


# ---------------------------------------------------------------------------
# Integration tests for API endpoints
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_client(db_session):
    """TestClient with super_admin JWT override."""
    admin_user = User(
        first_name="Super",
        last_name="Admin",
        email="admin@test.com",
        password="hashed",
    )
    db_session.add(admin_user)
    db_session.flush()

    test_client = TestClient(app)
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": admin_user.id,
        "role": "SUPER_ADMIN",
        "tenant_id": None,
    }
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def tenant_client(db_session):
    """TestClient + a tenant with an active pro subscription, acting as tenant manager."""
    tenant = _make_tenant(db_session)
    plan = _make_plan(db_session, name="pro")
    _subscribe(db_session, tenant, plan)
    db_session.commit()

    test_client = TestClient(app)
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": 999,
        "role": "TENANT_MANAGER",
        "tenant_id": tenant.id,
    }
    yield test_client, tenant
    app.dependency_overrides.clear()


@pytest.fixture
def gated_booking_client(db_session, monkeypatch):
    """
    TestClient for /appointments/book that keeps focus on feature-gate behavior.
    Appointment domain logic is stubbed to avoid duplicating lifecycle fixture setup.
    """
    tenant = _make_tenant(db_session, name="Booking Tenant", licence="LIC-BOOK")
    plan = _make_plan(db_session, name="pro")
    _subscribe(db_session, tenant, plan)
    db_session.commit()

    def _fake_book_appointment(*args, **kwargs):
        return SimpleNamespace(
            id=12345,
            status=SimpleNamespace(value="REQUESTED"),
        )

    monkeypatch.setattr("app.routes.patient_appointment.book_appointment", _fake_book_appointment)
    monkeypatch.setattr(
        "app.routes.patient_appointment.create_notification",
        lambda *args, **kwargs: None,
    )

    test_client = TestClient(app)
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": 777,
        "role": "CLIENT",
        "tenant_id": tenant.id,
    }
    yield test_client, tenant
    app.dependency_overrides.clear()


class TestAdminEndpoints:
    def test_list_flags_can_filter_by_tenant(self, admin_client, db_session):
        tenant_a = _make_tenant(db_session, name="Tenant A", licence="LIC-A")
        tenant_b = _make_tenant(db_session, name="Tenant B", licence="LIC-B")
        plan = _make_plan(db_session, name="pro")
        _subscribe(db_session, tenant_a, plan)
        _plan_default(db_session, "pro", "advanced_reports", True)
        _tenant_override(db_session, tenant_a.id, "advanced_reports", False)
        _tenant_override(db_session, tenant_b.id, "advanced_reports", True)
        db_session.commit()

        res = admin_client.get(f"/api/superadmin/feature-flags?tenant_id={tenant_a.id}")
        assert res.status_code == 200
        payload = res.json()
        assert any(item["tenant_id"] is None for item in payload)
        assert any(item["tenant_id"] == tenant_a.id for item in payload)
        assert all(item["tenant_id"] in (None, tenant_a.id) for item in payload)

    def test_list_feature_flag_tenants(self, admin_client, db_session):
        tenant_b = _make_tenant(db_session, name="Beta Clinic", licence="LIC-BETA")
        tenant_a = _make_tenant(db_session, name="Alpha Clinic", licence="LIC-ALPHA")
        db_session.commit()

        res = admin_client.get("/api/superadmin/feature-flags/tenants")
        assert res.status_code == 200
        payload = res.json()
        assert [item["id"] for item in payload][:2] == [tenant_a.id, tenant_b.id]
        assert payload[0]["name"] == tenant_a.name

    def test_reset_to_seed_restores_defaults_and_clears_overrides(self, admin_client, db_session):
        tenant = _make_tenant(db_session, name="Reset Tenant", licence="LIC-RESET")
        db_session.add(
            FeatureFlag(
                tenant_id=None,
                plan_tier="free",
                feature_key="advanced_reports",
                enabled=True,  # opposite of seed for free
            )
        )
        db_session.add(
            FeatureFlag(
                tenant_id=None,
                plan_tier="free",
                feature_key="custom_non_seed_feature",
                enabled=True,
            )
        )
        db_session.add(
            FeatureFlag(
                tenant_id=tenant.id,
                plan_tier=None,
                feature_key="advanced_reports",
                enabled=True,
            )
        )
        db_session.commit()

        res = admin_client.post("/api/superadmin/feature-flags/reset")
        assert res.status_code == 200
        payload = res.json()
        assert isinstance(payload, list)

        all_flags = db_session.query(FeatureFlag).all()
        assert all(flag.tenant_id is None for flag in all_flags)

        expected_total = sum(len(v) for v in SEED_FEATURE_FLAGS.values())
        assert len(all_flags) == expected_total
        assert len(payload) == expected_total

        free_advanced = (
            db_session.query(FeatureFlag)
            .filter(
                FeatureFlag.tenant_id.is_(None),
                FeatureFlag.plan_tier == "free",
                FeatureFlag.feature_key == "advanced_reports",
            )
            .one()
        )
        assert free_advanced.enabled is False

    def test_create_plan_default(self, admin_client):
        res = admin_client.post(
            "/api/superadmin/feature-flags/defaults",
            json={"plan_tier": "pro", "feature_key": "advanced_reports", "enabled": True},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["plan_tier"] == "pro"
        assert data["feature_key"] == "advanced_reports"
        assert data["enabled"] is True
        assert data["tenant_id"] is None

    def test_upsert_plan_default_updates_existing(self, admin_client):
        admin_client.post(
            "/api/superadmin/feature-flags/defaults",
            json={"plan_tier": "pro", "feature_key": "telemedicine", "enabled": True},
        )
        res = admin_client.post(
            "/api/superadmin/feature-flags/defaults",
            json={"plan_tier": "pro", "feature_key": "telemedicine", "enabled": False},
        )
        assert res.status_code == 200
        assert res.json()["enabled"] is False

    def test_create_tenant_override(self, admin_client, db_session):
        tenant = _make_tenant(db_session, licence="LIC-T1")
        db_session.commit()

        res = admin_client.post(
            "/api/superadmin/feature-flags/overrides",
            json={"tenant_id": tenant.id, "feature_key": "bulk_export", "enabled": True},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["tenant_id"] == tenant.id
        assert data["enabled"] is True

    def test_create_tenant_override_returns_404_for_unknown_tenant(self, admin_client):
        res = admin_client.post(
            "/api/superadmin/feature-flags/overrides",
            json={"tenant_id": 999999, "feature_key": "bulk_export", "enabled": True},
        )
        assert res.status_code == 404

    def test_delete_plan_default(self, admin_client):
        res = admin_client.post(
            "/api/superadmin/feature-flags/defaults",
            json={"plan_tier": "free", "feature_key": "some_feature", "enabled": False},
        )
        flag_id = res.json()["id"]

        del_res = admin_client.delete(f"/api/superadmin/feature-flags/defaults/{flag_id}")
        assert del_res.status_code == 204

    def test_delete_nonexistent_default_returns_404(self, admin_client):
        res = admin_client.delete("/api/superadmin/feature-flags/defaults/99999")
        assert res.status_code == 404

    def test_list_flags(self, admin_client):
        admin_client.post(
            "/api/superadmin/feature-flags/defaults",
            json={"plan_tier": "pro", "feature_key": "feature_a", "enabled": True},
        )
        res = admin_client.get("/api/superadmin/feature-flags")
        assert res.status_code == 200
        assert len(res.json()) >= 1


class TestEvaluateEndpoint:
    def test_evaluate_returns_enabled_true(self, tenant_client, db_session):
        test_client, tenant = tenant_client
        _plan_default(db_session, "pro", "telemedicine", True)
        db_session.commit()

        res = test_client.get("/api/feature-flags/telemedicine")
        assert res.status_code == 200
        data = res.json()
        assert data["enabled"] is True
        assert data["feature_key"] == "telemedicine"
        assert data["tenant_id"] == tenant.id

    def test_evaluate_returns_enabled_false_for_disabled_feature(self, tenant_client, db_session):
        test_client, tenant = tenant_client
        _plan_default(db_session, "pro", "legacy_api", False)
        db_session.commit()

        res = test_client.get("/api/feature-flags/legacy_api")
        assert res.status_code == 200
        assert res.json()["enabled"] is False

    def test_evaluate_fallback_false_for_unknown_feature(self, tenant_client):
        test_client, _ = tenant_client
        res = test_client.get("/api/feature-flags/unknown_feature_xyz")
        assert res.status_code == 200
        assert res.json()["enabled"] is False

    def test_evaluate_override_overrides_plan_default(self, tenant_client, db_session):
        test_client, tenant = tenant_client
        _plan_default(db_session, "pro", "advanced_reports", False)
        _tenant_override(db_session, tenant.id, "advanced_reports", True)
        db_session.commit()

        res = test_client.get("/api/feature-flags/advanced_reports")
        assert res.status_code == 200
        assert res.json()["enabled"] is True

    def test_evaluate_returns_403_when_tenant_context_missing(self):
        test_client = TestClient(app)
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": 1001,
            "role": "TENANT_MANAGER",
            "tenant_id": None,
        }
        try:
            res = test_client.get("/api/feature-flags/advanced_reports")
            assert res.status_code == 403
            assert res.json()["detail"] == "No tenant associated with this account"
        finally:
            app.dependency_overrides.clear()

    def test_evaluate_returns_403_when_tenant_context_is_malformed(self):
        test_client = TestClient(app)
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": 1002,
            "role": "TENANT_MANAGER",
            "tenant_id": "tenant-abc",
        }
        try:
            res = test_client.get("/api/feature-flags/advanced_reports")
            assert res.status_code == 403
            assert res.json()["detail"] == "No tenant associated with this account"
        finally:
            app.dependency_overrides.clear()


class TestProtectedEndpointGating:
    @staticmethod
    def _book_payload(tenant_id: int) -> dict:
        return {
            "tenant_id": tenant_id,
            "doctor_id": 101,
            "department_id": 11,
            "appointment_datetime": "2026-03-09T10:00:00Z",
            "duration_minutes": 30,
            "description": "Gating test payload",
        }

    def test_book_denied_when_override_disables_feature(self, gated_booking_client, db_session):
        test_client, tenant = gated_booking_client
        _plan_default(db_session, "pro", "basic_appointments", True)
        _tenant_override(db_session, tenant.id, "basic_appointments", False)
        db_session.commit()

        res = test_client.post("/appointments/book", json=self._book_payload(tenant.id))
        assert res.status_code == 403
        assert "basic_appointments" in res.json()["detail"]

    def test_book_allowed_when_plan_default_enables_feature(self, gated_booking_client, db_session):
        test_client, tenant = gated_booking_client
        _plan_default(db_session, "pro", "basic_appointments", True)
        db_session.commit()

        res = test_client.post("/appointments/book", json=self._book_payload(tenant.id))
        assert res.status_code == 200
        assert res.json() == {"id": 12345, "status": "REQUESTED"}

    def test_book_denied_when_tenant_context_missing(self, db_session):
        test_client = TestClient(app)
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": 1003,
            "role": "CLIENT",
            "tenant_id": None,
        }
        try:
            res = test_client.post("/appointments/book", json=self._book_payload(tenant_id=1))
            assert res.status_code == 403
            assert res.json()["detail"] == "Feature not available"
        finally:
            app.dependency_overrides.clear()

    def test_book_denied_when_tenant_context_malformed(self, db_session):
        test_client = TestClient(app)
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": 1004,
            "role": "CLIENT",
            "tenant_id": "bad-tenant",
        }
        try:
            res = test_client.post("/appointments/book", json=self._book_payload(tenant_id=1))
            assert res.status_code == 403
            assert res.json()["detail"] == "Feature not available"
        finally:
            app.dependency_overrides.clear()
