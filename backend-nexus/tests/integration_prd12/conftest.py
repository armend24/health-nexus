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
    FeatureFlag,
    Patient,
    Role,
    SubscriptionPlan,
    Tenant,
    TenantDepartment,
    TenantSubscription,
    User,
    UserTenantPlan,
)
from app.models.tenant import TenantStatus
from app.models.tenant_subscription import SubscriptionStatus


def _login(client: TestClient, email: str, password: str = "Team2026@") -> str:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _future_slot(hours_from_now: int = 24) -> str:
    slot = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(
        hours=hours_from_now
    )
    if slot.hour < 9:
        slot = slot.replace(hour=10)
    elif slot.hour > 16:
        slot = (slot + timedelta(days=1)).replace(hour=10)
    return slot.isoformat().replace("+00:00", "Z")


@pytest.fixture
def offer_ctx(db_session):
    doctor_role = Role(name="DOCTOR")
    client_role = Role(name="CLIENT")
    sales_role = Role(name="SALES")
    db_session.add_all([doctor_role, client_role, sales_role])
    db_session.flush()

    tenant = Tenant(
        name="Offer Integration Tenant",
        email="offers-integration@test.com",
        licence_number="OFF-INT-001",
        status=TenantStatus.approved,
    )
    db_session.add(tenant)
    db_session.flush()

    department = Department(name="General Care")
    db_session.add(department)
    db_session.flush()

    tenant_department = TenantDepartment(
        tenant_id=tenant.id,
        department_id=department.id,
        phone_number="123456789",
    )
    db_session.add(tenant_department)
    db_session.flush()

    plan = SubscriptionPlan(name="medium clinic", price=99.0, duration=30)
    db_session.add(plan)
    db_session.flush()
    db_session.add(
        TenantSubscription(
            tenant_id=tenant.id,
            subscription_plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
        )
    )
    db_session.add_all(
        [
            FeatureFlag(
                tenant_id=None,
                plan_tier="medium clinic",
                feature_key="basic_appointments",
                enabled=True,
            ),
            FeatureFlag(
                tenant_id=None,
                plan_tier="medium clinic",
                feature_key="post_appointment_offers",
                enabled=True,
            ),
        ]
    )

    doctor_user = User(
        first_name="Doctor",
        last_name="Offer",
        email="doctor.offer@test.com",
        password=hash_password("Team2026@"),
        role_id=doctor_role.id,
    )
    patient_user = User(
        first_name="Client",
        last_name="Offer",
        email="client.offer@test.com",
        password=hash_password("Team2026@"),
        role_id=client_role.id,
    )
    sales_user = User(
        first_name="Sales",
        last_name="Offer",
        email="sales.offer@test.com",
        password=hash_password("Team2026@"),
        role_id=sales_role.id,
    )
    db_session.add_all([doctor_user, patient_user, sales_user])
    db_session.flush()

    weekday_hours = {
        "monday": [["09:00", "17:00"]],
        "tuesday": [["09:00", "17:00"]],
        "wednesday": [["09:00", "17:00"]],
        "thursday": [["09:00", "17:00"]],
        "friday": [["09:00", "17:00"]],
        "saturday": [["09:00", "17:00"]],
        "sunday": [["09:00", "17:00"]],
    }
    db_session.add(
        Doctor(
            user_id=doctor_user.id,
            tenant_id=tenant.id,
            tenant_department_id=tenant_department.id,
            working_hours=weekday_hours,
            is_active=True,
        )
    )
    db_session.add(Patient(tenant_id=tenant.id, user_id=patient_user.id))
    db_session.flush()

    user_plan = UserTenantPlan(
        tenant_id=tenant.id,
        name="Member Plan",
        description="Patient plan",
        price=0,
        duration=30,
        max_appointments=10,
        max_consultations=10,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(user_plan)
    db_session.flush()

    db_session.add(
        Enrollment(
            tenant_id=tenant.id,
            patient_user_id=patient_user.id,
            user_tenant_plan_id=user_plan.id,
            created_by=patient_user.id,
            status=EnrollmentStatus.ACTIVE,
        )
    )
    db_session.commit()

    client = TestClient(app)
    patient_token = _login(client, patient_user.email)
    doctor_token = _login(client, doctor_user.email)
    sales_token = _login(client, sales_user.email)

    return {
        "client": client,
        "db": db_session,
        "tenant_id": tenant.id,
        "department_id": tenant_department.id,
        "doctor_id": doctor_user.id,
        "patient_id": patient_user.id,
        "sales_id": sales_user.id,
        "patient_token": patient_token,
        "doctor_token": doctor_token,
        "sales_token": sales_token,
        "slot_1": _future_slot(24),
        "slot_2": _future_slot(26),
    }
