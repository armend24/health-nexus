# Integration tests for invalid lead status transitions.
# Uses parametrized tests to efficiently cover invalid transition matrix.
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import Role, User, Lead, LeadStatus
from app.auth.auth_utils import hash_password

@pytest.fixture
def sales_client(db_session):
    """Setup: Create SALES role, user, and TestClient."""
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

# Invalid Transition Matrix Tests
INVALID_TRANSITIONS = [
    # Terminal states cannot transition anywhere
    (LeadStatus.CONVERTED, LeadStatus.CONTACTED, "Terminal state CONVERTED cannot transition"),
    (LeadStatus.CONVERTED, LeadStatus.QUALIFIED, "Terminal state CONVERTED cannot transition"),
    (LeadStatus.REJECTED, LeadStatus.CONTACTED, "Terminal state REJECTED cannot transition"),
    (LeadStatus.REJECTED, LeadStatus.QUALIFIED, "Terminal state REJECTED cannot transition"),
    (LeadStatus.LOST, LeadStatus.CONTACTED, "Terminal state LOST cannot transition"),
    (LeadStatus.LOST, LeadStatus.QUALIFIED, "Terminal state LOST cannot transition"),
    # Skip stages (not allowed)
    (LeadStatus.NEW, LeadStatus.CONVERTED, "Cannot skip stages: NEW to CONVERTED"),
    (LeadStatus.NEW, LeadStatus.CONSULTATION_SCHEDULED, "Cannot skip stages: NEW to CONSULTATION_SCHEDULED"),
    (LeadStatus.CONTACTED, LeadStatus.CONVERTED, "Cannot skip stages: CONTACTED to CONVERTED"),
    (LeadStatus.CONTACTED, LeadStatus.AWAITING_DECISION, "Cannot skip stages: CONTACTED to AWAITING_DECISION"),
    (LeadStatus.CONSULTATION_SCHEDULED, LeadStatus.CONVERTED, "Cannot skip stages: CONSULTATION_SCHEDULED to CONVERTED"),
    # Backwards transitions (not allowed)
    (LeadStatus.CONTACTED, LeadStatus.QUALIFIED, "Cannot go backwards: CONTACTED to QUALIFIED"),
    (LeadStatus.CONSULTATION_COMPLETED, LeadStatus.CONTACTED, "Cannot go backwards: CONSULTATION_COMPLETED to CONTACTED"),
]

@pytest.mark.parametrize("from_status,to_status,description", INVALID_TRANSITIONS)
def test_invalid_transitions_fail(sales_client, db_session, from_status, to_status, description):
    # Test that invalid transitions return 400 and do not update the database.
    
    # Get the sales user
    sales_user = db_session.query(User).filter(
        User.email == "sales.agent@test.com"
    ).first()
    
    # Create a lead in the starting status
    lead = Lead(
        licence_number=f"LIC-INVALID-{from_status.value}",
        organization_name=f"Test Org {from_status.value}",
        contact_name="Test User",
        contact_email="test@testorg.com",
        source="consultation_form",
        status=from_status,
        assigned_sales_user_id=sales_user.id,
    )
    
    db_session.add(lead)
    db_session.commit()
    db_session.refresh(lead)
    
    # Login
    login_response = sales_client.post(
        "/api/auth/login",
        json={
            "email": "sales.agent@test.com",
            "password": "SalesPass123!",
        },
    )
    
    assert login_response.status_code == 200, "Login should succeed"
    access_token = login_response.json()["access_token"]
    
    # Attempt invalid transition
    transition_response = sales_client.post(
        f"/api/leads/{lead.id}/transition",
        json={
            "new_status": to_status.value,
            "reason": "Testing invalid transition",
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    
    # Verify it fails with 400
    assert transition_response.status_code == 400, (
        f"{description}: Expected 400, got {transition_response.status_code}. "
        f"Response: {transition_response.text}"
    )
    
    # Verify the database was NOT updated
    db_session.refresh(lead)
    assert lead.status == from_status, (
        f"{description}: Lead status should remain {from_status}. Got {lead.status}"
    )
