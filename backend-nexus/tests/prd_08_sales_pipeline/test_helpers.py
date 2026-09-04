# Shared helper functions for lead tests
from app.models import User, Lead, ConsultationBooking


def get_sales_user(db_session):
    # Get the test sales user.
    return db_session.query(User).filter(
        User.email == "sales.agent@test.com"
    ).first()


def create_lead(db_session, status, licence_suffix):
    # Create a lead with the given status.
    sales_user = get_sales_user(db_session)
    
    lead = Lead(
        licence_number=f"LIC-{licence_suffix}",
        organization_name=f"Test Org {licence_suffix}",
        contact_name="Test User",
        contact_email=f"test-{licence_suffix}@testorg.com",
        source="consultation_form",
        status=status,
        assigned_sales_user_id=sales_user.id,
    )
    
    db_session.add(lead)
    db_session.commit()
    db_session.refresh(lead)
    
    return lead


def create_consultation(db_session, lead_id, status):
    # Create a consultation booking with the given status.
    sales_user = get_sales_user(db_session)
    
    consultation = ConsultationBooking(
        lead_id=lead_id,
        scheduled_at=db_session.query(User).first().created_at,
        duration_minutes=60,
        location="Zoom",
        status=status,
        created_by_user_id=sales_user.id,
    )
    
    db_session.add(consultation)
    db_session.commit()
    
    return consultation


def login_sales_user(sales_client):
    # Login as the test sales user. Returns the access token.
    login_response = sales_client.post(
        "/api/auth/login",
        json={
            "email": "sales.agent@test.com",
            "password": "SalesPass123!",
        },
    )
    
    assert login_response.status_code == 200, "Login should succeed"
    return login_response.json()["access_token"]


def transition_lead(sales_client, lead_id, new_status, reason=None):
    # Attempt to transition a lead. Returns the response.
    access_token = login_sales_user(sales_client)
    
    response = sales_client.post(
        f"/api/leads/{lead_id}/transition",
        json={
            "new_status": new_status,
            "reason": reason,
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    
    return response
