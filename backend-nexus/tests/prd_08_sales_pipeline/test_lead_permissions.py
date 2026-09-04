# Integration tests for lead permission enforcement.
# Tests authorization: only the lead owner can transition leads, wrong roles are blocked, etc.
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import Role, User, Lead, LeadStatus
from app.auth.auth_utils import hash_password
from .test_helpers import get_sales_user, create_lead

@pytest.fixture
def sales_client(db_session):
    # Setup: Create SALES role, user, and TestClient.
    sales_role = Role(name="SALES")
    db_session.add(sales_role)
    db_session.flush()
    
    sales_user = User(
        first_name="John",
        last_name="Agent",
        email="sales.agent@test.com",
        password=hash_password("SalesPass123!"),
        role_id=sales_role.id,
    )
    
    db_session.add(sales_user)
    db_session.commit()
    
    yield TestClient(app)

@pytest.fixture
def other_sales_client(db_session):
    # Setup: Create a second SALES user (different from the main sales agent).
    sales_role = db_session.query(Role).filter(Role.name == "SALES").first()
    if not sales_role:
        sales_role = Role(name="SALES")
        db_session.add(sales_role)
        db_session.flush()
    
    other_user = User(
        first_name="Jane",
        last_name="OtherAgent",
        email="other.agent@test.com",
        password=hash_password("OtherPass123!"),
        role_id=sales_role.id,
    )
    
    db_session.add(other_user)
    db_session.commit()
    
    return TestClient(app)

@pytest.fixture
def client_user_client(db_session):
    # Setup: Create a CLIENT role user.
    client_role = Role(name="CLIENT")
    db_session.add(client_role)
    db_session.flush()
    
    client_user = User(
        first_name="Bob",
        last_name="Client",
        email="client@test.com",
        password=hash_password("ClientPass123!"),
        role_id=client_role.id,
    )
    
    db_session.add(client_user)
    db_session.commit()
    
    return TestClient(app)


# Permission Tests

# Non-Owner Cannot Transition
def test_non_owner_sales_user_cannot_transition_lead(sales_client, other_sales_client, db_session):
    # Non-owner sales user cannot transition another user's lead. Expects 403 Forbidden.
    
    # Setup: Create a lead owned by the first sales user
    lead = create_lead(db_session, LeadStatus.NEW, "perm-001")
    
    # Act: Try to transition as the OTHER sales user
    login_response = other_sales_client.post(
        "/api/auth/login",
        json={
            "email": "other.agent@test.com",
            "password": "OtherPass123!",
        },
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    
    response = other_sales_client.post(
        f"/api/leads/{lead.id}/transition",
        json={
            "new_status": "QUALIFIED",
            "reason": None,
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    
    # Assert: Should be forbidden (403)
    assert response.status_code == 403, (
        f"Non-owner should not be able to transition. Got {response.status_code}: {response.text}"
    )
    
    # Verify database was NOT updated
    db_session.refresh(lead)
    assert lead.status == LeadStatus.NEW, "Lead status should not change"


# Permission Tests: Wrong Role Cannot Transition
def test_client_role_cannot_transition_lead(sales_client, client_user_client, db_session):
    # CLIENT role user cannot transition leads (SALES role required). Expects 403 Forbidden.
    
    # Setup: Create a lead
    lead = create_lead(db_session, LeadStatus.NEW, "perm-002")
    
    # Act: Try to transition as CLIENT role
    login_response = client_user_client.post(
        "/api/auth/login",
        json={
            "email": "client@test.com",
            "password": "ClientPass123!",
        },
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    
    response = client_user_client.post(
        f"/api/leads/{lead.id}/transition",
        json={
            "new_status": "QUALIFIED",
            "reason": None,
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    
    # Assert: Should be forbidden (403)
    assert response.status_code == 403, (
        f"CLIENT role should not be able to transition. Got {response.status_code}: {response.text}"
    )
    
    # Verify database was NOT updated
    db_session.refresh(lead)
    assert lead.status == LeadStatus.NEW, "Lead status should not change"


def test_unauthenticated_user_cannot_transition_lead(sales_client, db_session):
    # Unauthenticated user (no token) cannot transition leads. Expects 401 or 403.

    # Setup: Create a lead
    lead = create_lead(db_session, LeadStatus.NEW, "perm-003")
    
    # Act: Try to transition without authentication
    response = sales_client.post(
        f"/api/leads/{lead.id}/transition",
        json={
            "new_status": "QUALIFIED",
            "reason": None,
        },
    )
    
    # Assert: Should be unauthorized (401) or forbidden (403)
    assert response.status_code in [401, 403], (
        f"Unauthenticated should be rejected. Got {response.status_code}: {response.text}"
    )
    
    # Verify database was NOT updated
    db_session.refresh(lead)
    assert lead.status == LeadStatus.NEW, "Lead status should not change"


# Owner CAN Transition (Sanity Check)
def test_owner_can_transition_own_lead(sales_client, db_session):
    # Sanity check: The lead owner CAN transition their own lead.
    
    # Setup: Create a lead
    lead = create_lead(db_session, LeadStatus.NEW, "perm-004")
    
    # Act: Transition as the owner
    login_response = sales_client.post(
        "/api/auth/login",
        json={
            "email": "sales.agent@test.com",
            "password": "SalesPass123!",
        },
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    
    response = sales_client.post(
        f"/api/leads/{lead.id}/transition",
        json={
            "new_status": "QUALIFIED",
            "reason": None,
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    
    # Assert: Should succeed (200)
    assert response.status_code == 200, (
        f"Owner should be able to transition. Got {response.status_code}: {response.text}"
    )
    
    # Verify database WAS updated
    db_session.refresh(lead)
    assert lead.status == LeadStatus.QUALIFIED, "Lead status should change to QUALIFIED"