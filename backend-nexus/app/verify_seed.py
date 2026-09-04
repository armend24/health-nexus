from app.db import SessionLocal
from app.models import SubscriptionPlan, Role, Tenant, User

EXPECTED_ROLES = 5
EXPECTED_TENANTS = 4
EXPECTED_SUBSCRIPTION_PLANS = 4
EXPECTED_USERS = 5


def verify_seed_data() -> None:
    session = SessionLocal()
    try:
        role_count = session.query(Role).count()
        tenant_count = session.query(Tenant).count()
        subscription_plan_count = session.query(SubscriptionPlan).count()
        user_count = session.query(User).count()

        assert (
            role_count >= EXPECTED_ROLES
        ), f"Expected at least {EXPECTED_ROLES} roles, got {role_count}"
        assert (
            tenant_count >= EXPECTED_TENANTS
        ), f"Expected at least {EXPECTED_TENANTS} tenants, got {tenant_count}"
        assert (
            subscription_plan_count >= EXPECTED_SUBSCRIPTION_PLANS
        ), f"Expected at least {EXPECTED_SUBSCRIPTION_PLANS} subscription plans, got {subscription_plan_count}"
        assert (
            user_count >= EXPECTED_USERS
        ), f"Expected at least {EXPECTED_USERS} users, got {user_count}"

        print("Seed verification passed.")
    finally:
        session.close()


if __name__ == "__main__":
    verify_seed_data()
