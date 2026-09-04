"""
Simple CRUD test to verify database connection and basic operations.
"""

from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import Role, Tenant, SubscriptionPlan, TenantSubscription


def test_crud_operations():
    session = SessionLocal()

    try:
        # TEST CREATE
        role = Role(name="Admin")
        session.add(role)
        session.commit()
        assert role.id is not None

        # TEST READ
        fetched_role = session.query(Role).filter(Role.name == "Admin").first()
        assert fetched_role is not None
        assert fetched_role.name == "Admin"

        # TEST UPDATE
        fetched_role.name = "SuperAdmin"
        session.commit()
        updated_role = session.query(Role).filter(Role.id == role.id).first()
        assert updated_role is not None
        assert updated_role.name == "SuperAdmin"

        # TEST CREATE with relationships
        tenant = Tenant(
            name="Health Nexus Clinic",
            email="crud-tenant@example.com",
            licence_number="CRUD-001",
        )
        session.add(tenant)
        session.flush()

        subscription_plan = SubscriptionPlan(
            name="Pro Plan",
            price=99.99,
            duration=30,
        )
        session.add(subscription_plan)
        session.flush()

        subscription = TenantSubscription(
            tenant_id=tenant.id,
            subscription_plan_id=subscription_plan.id,
            status="ACTIVE",
            activated_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=30),
        )
        session.add(subscription)
        session.commit()

        # TEST COMPLEX READ
        fetched_subscription = (
            session.query(TenantSubscription)
            .filter(TenantSubscription.id == subscription.id)
            .first()
        )
        assert fetched_subscription is not None
        assert fetched_subscription.tenant.name == "Health Nexus Clinic"
        assert fetched_subscription.subscription_plan.name == "Pro Plan"
        assert str(fetched_subscription.status) in {"SubscriptionStatus.ACTIVE", "ACTIVE"}

        # TEST DELETE
        session.delete(fetched_role)
        session.commit()
        deleted_check = session.query(Role).filter(Role.id == role.id).first()
        assert deleted_check is None

    finally:
        session.close()
