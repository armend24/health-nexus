# Integration tests for valid lead status transitions (happy paths).
# Tests the core sales pipeline
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import Role, User, Lead, LeadStatus, ConsultationBooking, ConsultationStatus
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


def test_lead_new_to_qualified_succeeds(sales_client, db_session):
    # NEW to QUALIFIED transition succeeds.
    lead = create_lead(db_session, LeadStatus.NEW, "001")
    
    response = transition_lead(sales_client, lead.id, "QUALIFIED")
    
    assert response.status_code == 200
    assert response.json()["status"] == "QUALIFIED"
    db_session.refresh(lead)
    assert lead.status == LeadStatus.QUALIFIED

def test_lead_qualified_to_contacted_succeeds(sales_client, db_session):
    # QUALIFIED to CONTACTED transition succeeds.
    lead = create_lead(db_session, LeadStatus.QUALIFIED, "002")
    
    response = transition_lead(sales_client, lead.id, "CONTACTED")
    
    assert response.status_code == 200
    assert response.json()["status"] == "CONTACTED"
    db_session.refresh(lead)
    assert lead.status == LeadStatus.CONTACTED

def test_lead_contacted_to_consultation_scheduled_succeeds(sales_client, db_session):
    # CONTACTED to CONSULTATION_SCHEDULED transition succeeds when consultation exists.
    lead = create_lead(db_session, LeadStatus.CONTACTED, "003")
    create_consultation(db_session, lead.id, ConsultationStatus.SCHEDULED)
    
    response = transition_lead(sales_client, lead.id, "CONSULTATION_SCHEDULED")
    
    assert response.status_code == 200
    assert response.json()["status"] == "CONSULTATION_SCHEDULED"
    db_session.refresh(lead)
    assert lead.status == LeadStatus.CONSULTATION_SCHEDULED


def test_lead_consultation_scheduled_to_completed_succeeds(sales_client, db_session):
    # CONSULTATION_SCHEDULED to CONSULTATION_COMPLETED transition succeeds when consultation is completed.
    lead = create_lead(db_session, LeadStatus.CONSULTATION_SCHEDULED, "004")
    create_consultation(db_session, lead.id, ConsultationStatus.COMPLETED)
    
    response = transition_lead(sales_client, lead.id, "CONSULTATION_COMPLETED")
    
    assert response.status_code == 200
    assert response.json()["status"] == "CONSULTATION_COMPLETED"
    db_session.refresh(lead)
    assert lead.status == LeadStatus.CONSULTATION_COMPLETED

def test_lead_consultation_completed_to_awaiting_decision_succeeds(sales_client, db_session):
    # CONSULTATION_COMPLETED to AWAITING_DECISION transition succeeds.
    lead = create_lead(db_session, LeadStatus.CONSULTATION_COMPLETED, "005")
    
    response = transition_lead(sales_client, lead.id, "AWAITING_DECISION", reason="Waiting for response")
    
    assert response.status_code == 200
    assert response.json()["status"] == "AWAITING_DECISION"
    db_session.refresh(lead)
    assert lead.status == LeadStatus.AWAITING_DECISION

def test_lead_awaiting_decision_to_converted_succeeds(sales_client, db_session):
    # AWAITING_DECISION to CONVERTED transition succeeds (terminal state).
    lead = create_lead(db_session, LeadStatus.AWAITING_DECISION, "006")
    
    response = transition_lead(sales_client, lead.id, "CONVERTED", reason="Client signed")
    
    assert response.status_code == 200
    assert response.json()["status"] == "CONVERTED"
    db_session.refresh(lead)
    assert lead.status == LeadStatus.CONVERTED

def test_full_pipeline_succeeds(sales_client, db_session):
    # Full pipeline
    lead = create_lead(db_session, LeadStatus.NEW, "007")
    
    # NEW to QUALIFIED
    resp = transition_lead(sales_client, lead.id, "QUALIFIED")
    assert resp.status_code == 200
    
    # QUALIFIED to CONTACTED
    resp = transition_lead(sales_client, lead.id, "CONTACTED")
    assert resp.status_code == 200
    
    # CONTACTED to CONSULTATION_SCHEDULED (requires consultation)
    create_consultation(db_session, lead.id, ConsultationStatus.SCHEDULED)
    resp = transition_lead(sales_client, lead.id, "CONSULTATION_SCHEDULED")
    assert resp.status_code == 200
    
    # CONSULTATION_SCHEDULED to CONSULTATION_COMPLETED (requires completed consultation)
    db_session.query(ConsultationBooking).filter(ConsultationBooking.lead_id == lead.id).delete()
    db_session.commit()
    create_consultation(db_session, lead.id, ConsultationStatus.COMPLETED)
    resp = transition_lead(sales_client, lead.id, "CONSULTATION_COMPLETED")
    assert resp.status_code == 200
    
    # CONSULTATION_COMPLETED to AWAITING_DECISION
    resp = transition_lead(sales_client, lead.id, "AWAITING_DECISION", reason="Deciding")
    assert resp.status_code == 200
    
    # AWAITING_DECISION to CONVERTED
    resp = transition_lead(sales_client, lead.id, "CONVERTED", reason="Converted")
    assert resp.status_code == 200
    
    # Verify final state
    db_session.refresh(lead)
    assert lead.status == LeadStatus.CONVERTED
