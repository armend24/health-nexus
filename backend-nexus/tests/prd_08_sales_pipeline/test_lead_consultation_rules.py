# Integration tests for lead consultation dependency rules.
# Tests that lead transitions requiring consultations are properly enforced.
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import Role, User, Lead, LeadStatus, ConsultationStatus
from app.auth.auth_utils import hash_password
from .test_helpers import get_sales_user, create_lead, create_consultation, login_sales_user, transition_lead


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


def test_cannot_transition_to_consultation_scheduled_without_scheduled_booking(sales_client, db_session):
    # Cannot move to CONSULTATION_SCHEDULED without a SCHEDULED consultation booking.
    
    # Setup: Lead in CONTACTED state, no consultation booking
    lead = create_lead(db_session, LeadStatus.CONTACTED, "cons-001")
    
    # Act: Attempt transition without consultation
    response = transition_lead(sales_client, lead.id, "CONSULTATION_SCHEDULED")
    
    # Assert: Should fail with 400
    assert response.status_code == 400, (
        f"Should reject without consultation. Got {response.status_code}: {response.text}"
    )
    
    # Verify database was NOT updated
    db_session.refresh(lead)
    assert lead.status == LeadStatus.CONTACTED, "Lead status should not change"


def test_can_transition_to_consultation_scheduled_with_scheduled_booking(sales_client, db_session):
    # Can move to CONSULTATION_SCHEDULED when SCHEDULED consultation exists.
    
    # Setup: Lead in CONTACTED state with SCHEDULED consultation
    lead = create_lead(db_session, LeadStatus.CONTACTED, "cons-002")
    create_consultation(db_session, lead.id, ConsultationStatus.SCHEDULED)
    
    # Act: Transition with consultation present
    response = transition_lead(sales_client, lead.id, "CONSULTATION_SCHEDULED")
    
    # Assert: Should succeed (200)
    assert response.status_code == 200, (
        f"Should succeed with consultation. Got {response.status_code}: {response.text}"
    )
    
    # Verify database WAS updated
    db_session.refresh(lead)
    assert lead.status == LeadStatus.CONSULTATION_SCHEDULED, "Lead status should change"


def test_cannot_transition_to_consultation_completed_without_completed_booking(sales_client, db_session):
    # Cannot move to CONSULTATION_COMPLETED without a COMPLETED consultation booking.
    
    # Setup: Lead in CONSULTATION_SCHEDULED state with SCHEDULED (not COMPLETED) consultation
    lead = create_lead(db_session, LeadStatus.CONSULTATION_SCHEDULED, "cons-003")
    create_consultation(db_session, lead.id, ConsultationStatus.SCHEDULED)
    
    # Act: Attempt transition without completed consultation
    response = transition_lead(sales_client, lead.id, "CONSULTATION_COMPLETED")
    
    # Assert: Should fail with 400
    assert response.status_code == 400, (
        f"Should reject without completed consultation. Got {response.status_code}: {response.text}"
    )
    
    # Verify database was NOT updated
    db_session.refresh(lead)
    assert lead.status == LeadStatus.CONSULTATION_SCHEDULED, "Lead status should not change"


def test_can_transition_to_consultation_completed_with_completed_booking(sales_client, db_session):
    # Can move to CONSULTATION_COMPLETED when COMPLETED consultation exists.
    
    # Setup: Lead in CONSULTATION_SCHEDULED state with COMPLETED consultation
    lead = create_lead(db_session, LeadStatus.CONSULTATION_SCHEDULED, "cons-004")
    create_consultation(db_session, lead.id, ConsultationStatus.COMPLETED)
    
    # Act: Transition with completed consultation
    response = transition_lead(sales_client, lead.id, "CONSULTATION_COMPLETED")
    
    # Assert: Should succeed (200)
    assert response.status_code == 200, (
        f"Should succeed with completed consultation. Got {response.status_code}: {response.text}"
    )
    
    # Verify database WAS updated
    db_session.refresh(lead)
    assert lead.status == LeadStatus.CONSULTATION_COMPLETED, "Lead status should change"