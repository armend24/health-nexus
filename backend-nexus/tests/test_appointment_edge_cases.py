"""
FUL-29 – Appointment state-machine edge cases, reject flow, and notification
creation tests.

Covers every transition guard that wasn't exercised by the existing
test_appointment_lifecycle.py:
  • cancel / reschedule / approve / complete on terminal states
  • doctor reject endpoint
  • idempotent operations
  • notification records emitted on each action
  • notification CRUD endpoints (list, unread-count, mark-read, mark-all-read)
  • book → confirm → complete happy path
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth.auth_utils import hash_password
from app.main import app
from app.models import (
    Department,
    Doctor,
    Enrollment,
    EnrollmentStatus,
    Patient,
    Role,
    Tenant,
    TenantDepartment,
    TenantStatus,
    User,
    UserTenantPlan,
)
from app.models.notification import Notification

# ── helpers ─────────────────────────────────────────────────────────────────


def _login(client: TestClient, email: str, password: str = "Team2026@") -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _future_slot(weekday: int, hour: int) -> str:
    base_date = (datetime.now(timezone.utc) + timedelta(days=7)).date()
    days_until_weekday = (weekday - base_date.weekday()) % 7
    target_date = base_date + timedelta(days=days_until_weekday)
    return (
        datetime(
            target_date.year,
            target_date.month,
            target_date.day,
            hour,
            0,
            tzinfo=timezone.utc,
        )
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


# Use future working-day slots so the suite remains valid over time.
_SLOT_1 = _future_slot(0, 10)  # Monday 10:00 UTC
_SLOT_2 = _future_slot(0, 11)  # Monday 11:00 UTC
_SLOT_3 = _future_slot(1, 9)  # Tuesday 09:00 UTC


# ── fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def ctx(db_session):
    """Seed a minimal tenant + doctor + patient + enrollment."""
    doctor_role = Role(name="DOCTOR")
    client_role = Role(name="CLIENT")
    db_session.add_all([doctor_role, client_role])
    db_session.flush()

    tenant = Tenant(
        name="Edge Tenant",
        email="edge.tenant@test.com",
        licence_number="EDGE-001",
        status=TenantStatus.approved,
    )
    db_session.add(tenant)
    db_session.flush()

    dept = Department(name="General")
    db_session.add(dept)
    db_session.flush()

    td = TenantDepartment(tenant_id=tenant.id, department_id=dept.id, phone_number="000")
    db_session.add(td)
    db_session.flush()

    doctor_user = User(
        first_name="Dr",
        last_name="Edge",
        email="dr.edge@test.com",
        password=hash_password("Team2026@"),
        role_id=doctor_role.id,
    )
    patient_user = User(
        first_name="Pat",
        last_name="Edge",
        email="pat.edge@test.com",
        password=hash_password("Team2026@"),
        role_id=client_role.id,
    )
    db_session.add_all([doctor_user, patient_user])
    db_session.flush()

    doctor = Doctor(
        user_id=doctor_user.id,
        tenant_id=tenant.id,
        tenant_department_id=td.id,
        working_hours={
            "monday": [["09:00", "17:00"]],
            "tuesday": [["09:00", "17:00"]],
        },
        is_active=True,
    )
    db_session.add(doctor)

    patient = Patient(tenant_id=tenant.id, user_id=patient_user.id)
    db_session.add(patient)
    db_session.flush()

    plan = UserTenantPlan(
        tenant_id=tenant.id,
        name="Test Plan",
        description="t",
        price=0,
        duration=30,
        max_appointments=50,
        max_consultations=50,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(plan)
    db_session.flush()

    enrollment = Enrollment(
        tenant_id=tenant.id,
        patient_user_id=patient_user.id,
        user_tenant_plan_id=plan.id,
        created_by=patient_user.id,
        status=EnrollmentStatus.ACTIVE,
    )
    db_session.add(enrollment)
    db_session.commit()

    c = TestClient(app)
    pt = _login(c, patient_user.email)
    dt = _login(c, doctor_user.email)

    yield {
        "client": c,
        "patient_token": pt,
        "doctor_token": dt,
        "tenant_id": tenant.id,
        "department_id": td.id,
        "doctor_id": doctor_user.id,
        "patient_id": patient_user.id,
        "db": db_session,
    }


def _book(ctx, slot=_SLOT_1):
    resp = ctx["client"].post(
        "/appointments/book",
        headers=_auth(ctx["patient_token"]),
        json={
            "tenant_id": ctx["tenant_id"],
            "doctor_id": ctx["doctor_id"],
            "department_id": ctx["department_id"],
            "appointment_datetime": slot,
            "duration_minutes": 30,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# ══════════════════════════════════════════════════════════════════════════════
# 1. Happy path: book → confirm → complete
# ══════════════════════════════════════════════════════════════════════════════


class TestHappyCompletionPath:
    def test_book_approve_complete(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        approve = c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        assert approve.status_code == 200
        assert approve.json()["status"] == "CONFIRMED"

        complete = c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))
        assert complete.status_code == 200
        assert complete.json()["status"] == "COMPLETED"

        # verify status history shows full chain
        hist = c.get(f"/appointments/{aid}/status-history", headers=_auth(dt))
        assert hist.status_code == 200
        chain = [h["new_status"] for h in hist.json()]
        assert chain == ["REQUESTED", "CONFIRMED", "COMPLETED"]


# ══════════════════════════════════════════════════════════════════════════════
# 2. Doctor reject flow
# ══════════════════════════════════════════════════════════════════════════════


class TestRejectFlow:
    def test_reject_requested_appointment(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        reject = c.patch(f"/appointments/{aid}/reject", headers=_auth(dt))
        assert reject.status_code == 200
        assert reject.json()["status"] == "CANCELLED"

    def test_reject_confirmed_appointment(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))

        reject = c.patch(f"/appointments/{aid}/reject", headers=_auth(dt))
        assert reject.status_code == 200
        assert reject.json()["status"] == "CANCELLED"

    def test_reject_completed_returns_400(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))

        reject = c.patch(f"/appointments/{aid}/reject", headers=_auth(dt))
        assert reject.status_code == 400

    def test_reject_already_cancelled_is_idempotent(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        c.patch(f"/appointments/{aid}/reject", headers=_auth(dt))
        reject2 = c.patch(f"/appointments/{aid}/reject", headers=_auth(dt))
        assert reject2.status_code == 200
        assert reject2.json()["status"] == "CANCELLED"


# ══════════════════════════════════════════════════════════════════════════════
# 3. Invalid state transitions
# ══════════════════════════════════════════════════════════════════════════════


class TestInvalidTransitions:
    def test_cancel_completed_appointment(self, ctx):
        aid = _book(ctx)
        c, dt, pt = ctx["client"], ctx["doctor_token"], ctx["patient_token"]

        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))

        cancel = c.patch(f"/appointments/{aid}/cancel", headers=_auth(pt))
        assert cancel.status_code == 400

    def test_reschedule_cancelled_appointment(self, ctx):
        aid = _book(ctx)
        c, pt = ctx["client"], ctx["patient_token"]

        c.patch(f"/appointments/{aid}/cancel", headers=_auth(pt))

        resched = c.patch(
            f"/appointments/{aid}/reschedule",
            headers=_auth(pt),
            json={
                "tenant_id": ctx["tenant_id"],
                "doctor_id": ctx["doctor_id"],
                "department_id": ctx["department_id"],
                "appointment_datetime": _SLOT_2,
                "duration_minutes": 30,
            },
        )
        assert resched.status_code == 400

    def test_reschedule_completed_appointment(self, ctx):
        aid = _book(ctx)
        c, dt, pt = ctx["client"], ctx["doctor_token"], ctx["patient_token"]

        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))

        resched = c.patch(
            f"/appointments/{aid}/reschedule",
            headers=_auth(pt),
            json={
                "tenant_id": ctx["tenant_id"],
                "doctor_id": ctx["doctor_id"],
                "department_id": ctx["department_id"],
                "appointment_datetime": _SLOT_2,
                "duration_minutes": 30,
            },
        )
        assert resched.status_code == 400

    def test_approve_cancelled_appointment(self, ctx):
        aid = _book(ctx)
        c, dt, pt = ctx["client"], ctx["doctor_token"], ctx["patient_token"]

        c.patch(f"/appointments/{aid}/cancel", headers=_auth(pt))

        approve = c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        assert approve.status_code == 400

    def test_approve_completed_appointment(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))

        approve = c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        assert approve.status_code == 400

    def test_complete_requested_appointment(self, ctx):
        """Only CONFIRMED can be completed."""
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        complete = c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))
        assert complete.status_code == 400

    def test_complete_cancelled_appointment(self, ctx):
        aid = _book(ctx)
        c, dt, pt = ctx["client"], ctx["doctor_token"], ctx["patient_token"]

        c.patch(f"/appointments/{aid}/cancel", headers=_auth(pt))

        complete = c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))
        assert complete.status_code == 400


# ══════════════════════════════════════════════════════════════════════════════
# 4. Idempotent operations
# ══════════════════════════════════════════════════════════════════════════════


class TestIdempotentOps:
    def test_approve_already_confirmed_is_idempotent(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        approve2 = c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        assert approve2.status_code == 200
        assert approve2.json()["status"] == "CONFIRMED"

    def test_complete_already_completed_is_idempotent(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))

        complete2 = c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))
        assert complete2.status_code == 200
        assert complete2.json()["status"] == "COMPLETED"

    def test_cancel_already_cancelled_is_idempotent(self, ctx):
        aid = _book(ctx)
        c, pt = ctx["client"], ctx["patient_token"]

        c.patch(f"/appointments/{aid}/cancel", headers=_auth(pt))
        cancel2 = c.patch(f"/appointments/{aid}/cancel", headers=_auth(pt))
        assert cancel2.status_code == 200
        assert cancel2.json()["status"] == "CANCELLED"


# ══════════════════════════════════════════════════════════════════════════════
# 5. Reschedule conflict detection
# ══════════════════════════════════════════════════════════════════════════════


class TestRescheduleEdgeCases:
    def test_reschedule_into_occupied_slot(self, ctx):
        """Rescheduling into a slot occupied by another appointment → 400."""
        aid1 = _book(ctx, _SLOT_1)
        aid2 = _book(ctx, _SLOT_2)
        c, pt = ctx["client"], ctx["patient_token"]

        resched = c.patch(
            f"/appointments/{aid2}/reschedule",
            headers=_auth(pt),
            json={
                "tenant_id": ctx["tenant_id"],
                "doctor_id": ctx["doctor_id"],
                "department_id": ctx["department_id"],
                "appointment_datetime": _SLOT_1,
                "duration_minutes": 30,
            },
        )
        assert resched.status_code == 400

    def test_reschedule_by_non_owner_patient(self, ctx):
        """A patient cannot reschedule another patient's appointment."""
        aid = _book(ctx, _SLOT_1)
        c, db = ctx["client"], ctx["db"]

        # create a second patient
        client_role = db.query(Role).filter_by(name="CLIENT").first()
        user2 = User(
            first_name="Other",
            last_name="Pat",
            email="other.pat@test.com",
            password=hash_password("Team2026@"),
            role_id=client_role.id,
        )
        db.add(user2)
        db.flush()
        patient2 = Patient(tenant_id=ctx["tenant_id"], user_id=user2.id)
        db.add(patient2)
        plan = db.query(UserTenantPlan).filter_by(tenant_id=ctx["tenant_id"]).first()
        enrollment = Enrollment(
            tenant_id=ctx["tenant_id"],
            patient_user_id=user2.id,
            user_tenant_plan_id=plan.id,
            created_by=user2.id,
            status=EnrollmentStatus.ACTIVE,
        )
        db.add(enrollment)
        db.commit()

        token2 = _login(c, "other.pat@test.com")
        resched = c.patch(
            f"/appointments/{aid}/reschedule",
            headers=_auth(token2),
            json={
                "tenant_id": ctx["tenant_id"],
                "doctor_id": ctx["doctor_id"],
                "department_id": ctx["department_id"],
                "appointment_datetime": _SLOT_2,
                "duration_minutes": 30,
            },
        )
        assert resched.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# 6. Notification creation on appointment actions
# ══════════════════════════════════════════════════════════════════════════════


class TestNotificationCreation:
    """Verify a notification row is created for each appointment action."""

    def _notif_count(self, db, user_id, notif_type=None):
        q = db.query(Notification).filter(Notification.user_id == user_id)
        if notif_type:
            q = q.filter(Notification.type == notif_type)
        return q.count()

    def test_booking_creates_notification_for_doctor(self, ctx):
        _book(ctx)
        # doctor_id is the user_id of the doctor
        assert self._notif_count(ctx["db"], ctx["doctor_id"], "APPOINTMENT_CREATED") == 1

    def test_approve_creates_notification_for_patient(self, ctx):
        aid = _book(ctx)
        ctx["client"].patch(f"/appointments/{aid}/approve", headers=_auth(ctx["doctor_token"]))
        assert self._notif_count(ctx["db"], ctx["patient_id"], "APPOINTMENT_CONFIRMED") == 1

    def test_reject_creates_notification_for_patient(self, ctx):
        aid = _book(ctx)
        ctx["client"].patch(f"/appointments/{aid}/reject", headers=_auth(ctx["doctor_token"]))
        assert self._notif_count(ctx["db"], ctx["patient_id"], "APPOINTMENT_REJECTED") == 1

    def test_cancel_creates_notification_for_doctor(self, ctx):
        aid = _book(ctx)
        ctx["client"].patch(f"/appointments/{aid}/cancel", headers=_auth(ctx["patient_token"]))
        assert self._notif_count(ctx["db"], ctx["doctor_id"], "APPOINTMENT_CANCELLED") == 1

    def test_reschedule_creates_notification_for_doctor(self, ctx):
        aid = _book(ctx)
        ctx["client"].patch(
            f"/appointments/{aid}/reschedule",
            headers=_auth(ctx["patient_token"]),
            json={
                "tenant_id": ctx["tenant_id"],
                "doctor_id": ctx["doctor_id"],
                "department_id": ctx["department_id"],
                "appointment_datetime": _SLOT_2,
                "duration_minutes": 30,
            },
        )
        assert self._notif_count(ctx["db"], ctx["doctor_id"], "APPOINTMENT_RESCHEDULED") == 1

    def test_complete_creates_notification_for_patient(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]
        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))
        c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))
        assert self._notif_count(ctx["db"], ctx["patient_id"], "APPOINTMENT_COMPLETED") == 1


# ══════════════════════════════════════════════════════════════════════════════
# 7. Notification CRUD endpoints
# ══════════════════════════════════════════════════════════════════════════════


class TestNotificationEndpoints:
    def test_list_notifications(self, ctx):
        _book(ctx)  # creates APPOINTMENT_CREATED for doctor
        c, dt = ctx["client"], ctx["doctor_token"]

        resp = c.get("/notifications/me", headers=_auth(dt))
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1
        assert items[0]["type"] == "APPOINTMENT_CREATED"
        assert items[0]["is_read"] is False

    def test_unread_count(self, ctx):
        _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        resp = c.get("/notifications/me/unread-count", headers=_auth(dt))
        assert resp.status_code == 200
        assert resp.json()["count"] >= 1

    def test_mark_single_read(self, ctx):
        _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        notifs = c.get("/notifications/me", headers=_auth(dt)).json()
        nid = notifs[0]["id"]

        resp = c.patch(f"/notifications/{nid}/read", headers=_auth(dt))
        assert resp.status_code == 200
        assert resp.json()["is_read"] is True

        count = c.get("/notifications/me/unread-count", headers=_auth(dt)).json()["count"]
        assert count == 0

    def test_mark_all_read(self, ctx):
        _book(ctx, _SLOT_1)
        _book(ctx, _SLOT_2)
        c, dt = ctx["client"], ctx["doctor_token"]

        before = c.get("/notifications/me/unread-count", headers=_auth(dt)).json()["count"]
        assert before >= 2

        resp = c.patch("/notifications/me/read-all", headers=_auth(dt))
        assert resp.status_code == 200
        assert resp.json()["marked_read"] >= 2

        after = c.get("/notifications/me/unread-count", headers=_auth(dt)).json()["count"]
        assert after == 0

    def test_notification_contains_entity_reference(self, ctx):
        aid = _book(ctx)
        c, dt = ctx["client"], ctx["doctor_token"]

        notifs = c.get("/notifications/me", headers=_auth(dt)).json()
        assert notifs[0]["entity_type"] == "appointment"
        assert notifs[0]["entity_id"] == aid

    def test_cannot_read_other_users_notification(self, ctx):
        _book(ctx)  # creates notification for doctor
        c, pt = ctx["client"], ctx["patient_token"]

        # patient's own list is empty (no notification for patient from booking)
        notifs = c.get("/notifications/me", headers=_auth(pt)).json()
        # Try to mark doctor's notification as read using patient's token
        doctor_notifs = c.get("/notifications/me", headers=_auth(ctx["doctor_token"])).json()
        nid = doctor_notifs[0]["id"]

        resp = c.patch(f"/notifications/{nid}/read", headers=_auth(pt))
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# 8. Multi-cycle lifecycle: book → confirm → reschedule → re-confirm → complete
# ══════════════════════════════════════════════════════════════════════════════


class TestMultiCycleLifecycle:
    def test_book_confirm_reschedule_reconfirm_complete(self, ctx):
        c = ctx["client"]
        pt, dt = ctx["patient_token"], ctx["doctor_token"]

        aid = _book(ctx, _SLOT_1)

        # confirm
        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))

        # reschedule → goes back to REQUESTED
        resched = c.patch(
            f"/appointments/{aid}/reschedule",
            headers=_auth(pt),
            json={
                "tenant_id": ctx["tenant_id"],
                "doctor_id": ctx["doctor_id"],
                "department_id": ctx["department_id"],
                "appointment_datetime": _SLOT_3,
                "duration_minutes": 30,
            },
        )
        assert resched.json()["status"] == "REQUESTED"

        # re-confirm
        c.patch(f"/appointments/{aid}/approve", headers=_auth(dt))

        # complete
        complete = c.patch(f"/appointments/{aid}/complete", headers=_auth(dt))
        assert complete.json()["status"] == "COMPLETED"

        # full history
        hist = c.get(f"/appointments/{aid}/status-history", headers=_auth(dt))
        chain = [h["new_status"] for h in hist.json()]
        assert chain == [
            "REQUESTED",
            "CONFIRMED",
            "REQUESTED",
            "CONFIRMED",
            "COMPLETED",
        ]
