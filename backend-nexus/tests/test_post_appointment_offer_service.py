from datetime import datetime, timedelta, timezone

from app.models import (
    Appointment,
    AppointmentStatus,
    Department,
    Doctor,
    FeatureFlag,
    Patient,
    Recommendation,
    Role,
    SubscriptionPlan,
    Tenant,
    TenantDepartment,
    TenantSubscription,
    User,
)
from app.models.tenant import TenantStatus
from app.models.tenant_subscription import SubscriptionStatus
from app.services.offer_service import (
    APPROVED_RECOMMENDATION_CATEGORIES,
    evaluate_offer_eligibility,
    expire_offer_if_needed,
)
from app.models.offer_delivery import OfferDelivery, OfferDeliveryStatus


def _seed_offer_enabled_tenant(db_session):
    tenant = Tenant(
        name="Offer Unit Tenant",
        email="offers-unit@test.com",
        licence_number="OFF-UNIT-001",
        status=TenantStatus.approved,
    )
    plan = SubscriptionPlan(name="medium clinic", price=100.0, duration=30)
    db_session.add_all([tenant, plan])
    db_session.flush()
    db_session.add(
        TenantSubscription(
            tenant_id=tenant.id,
            subscription_plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
        )
    )
    db_session.add(
        FeatureFlag(
            tenant_id=None,
            plan_tier="medium clinic",
            feature_key="post_appointment_offers",
            enabled=True,
        )
    )
    return tenant


def _seed_users(db_session):
    doctor_role = Role(name="DOCTOR")
    client_role = Role(name="CLIENT")
    doctor = User(
        first_name="Doc",
        last_name="Unit",
        email="doc-unit@test.com",
        password="hashed",
        role=doctor_role,
    )
    client = User(
        first_name="Client",
        last_name="Unit",
        email="client-unit@test.com",
        password="hashed",
        role=client_role,
    )
    db_session.add_all([doctor_role, client_role, doctor, client])
    db_session.flush()
    return doctor, client


def _seed_clinical_profiles(db_session, tenant, doctor, client):
    department = Department(name="Offer Unit Department")
    db_session.add(department)
    db_session.flush()
    tenant_department = TenantDepartment(
        tenant_id=tenant.id,
        department_id=department.id,
        phone_number="555123456",
    )
    db_session.add(tenant_department)
    db_session.flush()
    db_session.add(
        Doctor(
            user_id=doctor.id,
            tenant_id=tenant.id,
            tenant_department_id=tenant_department.id,
            working_hours={"monday": [["09:00", "17:00"]]},
            is_active=True,
        )
    )
    db_session.add(Patient(tenant_id=tenant.id, user_id=client.id))
    db_session.flush()


def test_eligibility_requires_completed_appointment(db_session):
    tenant = _seed_offer_enabled_tenant(db_session)
    doctor, client = _seed_users(db_session)
    _seed_clinical_profiles(db_session, tenant, doctor, client)
    appointment = Appointment(
        appointment_datetime=datetime.now(timezone.utc) + timedelta(days=1),
        duration_minutes=30,
        doctor_user_id=doctor.id,
        patient_user_id=client.id,
        tenant_id=tenant.id,
        status=AppointmentStatus.CONFIRMED,
    )
    db_session.add(appointment)
    db_session.commit()

    result = evaluate_offer_eligibility(db_session, appointment)

    assert result.eligible is False
    assert result.reason == "appointment_not_completed"


def test_eligibility_uses_only_approved_categories(db_session):
    tenant = _seed_offer_enabled_tenant(db_session)
    doctor, client = _seed_users(db_session)
    _seed_clinical_profiles(db_session, tenant, doctor, client)
    appointment = Appointment(
        appointment_datetime=datetime.now(timezone.utc) + timedelta(days=1),
        duration_minutes=30,
        doctor_user_id=doctor.id,
        patient_user_id=client.id,
        tenant_id=tenant.id,
        status=AppointmentStatus.COMPLETED,
    )
    db_session.add(appointment)
    db_session.flush()
    db_session.add_all(
        [
            Recommendation(
                appointment_id=appointment.id,
                doctor_id=doctor.id,
                client_id=client.id,
                category=next(iter(APPROVED_RECOMMENDATION_CATEGORIES)),
                recommendation_type="Follow-up package",
                approved=True,
            ),
            Recommendation(
                appointment_id=appointment.id,
                doctor_id=doctor.id,
                client_id=client.id,
                category="UNAPPROVED_CATEGORY",
                recommendation_type="Should not pass",
                approved=True,
            ),
            Recommendation(
                appointment_id=appointment.id,
                doctor_id=doctor.id,
                client_id=client.id,
                category="LAB_TEST",
                recommendation_type="Needs doctor approval",
                approved=False,
            ),
        ]
    )
    db_session.commit()

    result = evaluate_offer_eligibility(db_session, appointment)

    assert result.eligible is True
    assert len(result.recommendations) == 1
    assert result.recommendations[0].recommendation_type == "Follow-up package"


def test_expire_offer_if_needed_marks_offer_expired(db_session):
    tenant = _seed_offer_enabled_tenant(db_session)
    doctor, client = _seed_users(db_session)
    _seed_clinical_profiles(db_session, tenant, doctor, client)
    appointment = Appointment(
        appointment_datetime=datetime.now(timezone.utc) + timedelta(days=1),
        duration_minutes=30,
        doctor_user_id=doctor.id,
        patient_user_id=client.id,
        tenant_id=tenant.id,
        status=AppointmentStatus.COMPLETED,
    )
    db_session.add(appointment)
    db_session.flush()
    recommendation = Recommendation(
        appointment_id=appointment.id,
        doctor_id=doctor.id,
        client_id=client.id,
        category="CARE_PLAN",
        recommendation_type="Care plan",
        approved=True,
    )
    db_session.add(recommendation)
    db_session.flush()
    offer = OfferDelivery(
        recommendation_id=recommendation.id,
        client_id=client.id,
        offer_status=OfferDeliveryStatus.DELIVERED,
        sent_at=datetime.now(timezone.utc) - timedelta(days=10),
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db_session.add(offer)
    db_session.commit()

    changed = expire_offer_if_needed(offer)

    assert changed is True
    assert offer.offer_status == OfferDeliveryStatus.EXPIRED
