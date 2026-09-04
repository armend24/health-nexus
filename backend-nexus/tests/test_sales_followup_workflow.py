"""
Integration tests for PRD-08 sales follow-up and lead-to-consultation workflow.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed import run_seed


@pytest.fixture
def client():
    """Seeded TestClient with sales users and sample leads."""
    run_seed()
    yield TestClient(app)


def _sales_headers(client: TestClient, email: str) -> dict[str, str]:
    """Login helper for sales users."""
    resp = client.post(
        "/api/auth/login",
        json={"email": email, "password": "Team2026@"},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_follow_up_owner_can_update_and_read_back_state(client: TestClient):
    """
    Owner can update follow-up fields and the updated values are readable in lead detail.
    """
    sales_headers = _sales_headers(client, "sales.agent@seed.com")

    create_resp = client.post(
        "/api/leads",
        json={
            "licence_number": "FW-001",
            "organization_name": "Followup Works Clinic",
            "contact_name": "Mila Quinn",
            "contact_email": "mila.followup@clinic.com",
            "contact_phone": "+1 555 101 2020",
            "initial_message": "Need sales callback for onboarding.",
            "source": "WEBSITE",
        },
    )
    assert create_resp.status_code == 201
    lead_id = create_resp.json()["id"]

    claim_resp = client.post(
        f"/api/leads/{lead_id}/owner?action=claim",
        headers=sales_headers,
    )
    assert claim_resp.status_code == 200

    due_at = datetime.now(timezone.utc) + timedelta(days=2)
    followup_resp = client.patch(
        f"/api/leads/{lead_id}/follow-up",
        json={
            "next_action": "Send proposal and schedule confirmation call",
            "next_action_due_at": due_at.isoformat(),
        },
        headers=sales_headers,
    )
    assert followup_resp.status_code == 200
    data = followup_resp.json()
    assert data["next_action"] == "Send proposal and schedule confirmation call"
    assert data["next_action_due_at"] is not None

    lead_resp = client.get(f"/api/leads/{lead_id}", headers=sales_headers)
    assert lead_resp.status_code == 200
    lead_data = lead_resp.json()
    assert lead_data["next_action"] == "Send proposal and schedule confirmation call"
    assert lead_data["next_action_due_at"] is not None


def test_follow_up_non_owner_is_forbidden(client: TestClient):
    """Only the lead owner can update follow-up details."""
    owner_headers = _sales_headers(client, "sales.agent@seed.com")
    other_sales_headers = _sales_headers(client, "sales.agent2@seed.com")

    create_resp = client.post(
        "/api/leads",
        json={
            "licence_number": "FW-002",
            "organization_name": "Ownership Guard Clinic",
            "contact_name": "Nora Lane",
            "contact_email": "nora.guard@clinic.com",
            "contact_phone": "+1 555 909 3030",
        },
    )
    assert create_resp.status_code == 201
    lead_id = create_resp.json()["id"]

    claim_resp = client.post(
        f"/api/leads/{lead_id}/owner?action=claim",
        headers=owner_headers,
    )
    assert claim_resp.status_code == 200

    forbidden_resp = client.patch(
        f"/api/leads/{lead_id}/follow-up",
        json={"next_action": "This update should fail"},
        headers=other_sales_headers,
    )
    assert forbidden_resp.status_code == 403
    assert "own" in forbidden_resp.json().get("detail", "").lower()


def test_lead_to_consultation_happy_path(client: TestClient):
    """
    Lead-to-consultation integration path:
    create lead -> claim -> transition pipeline -> create consultation.
    """
    sales_headers = _sales_headers(client, "sales.agent@seed.com")

    create_resp = client.post(
        "/api/leads",
        json={
            "licence_number": "LC-001",
            "organization_name": "Consult Path Medical",
            "contact_name": "Elena Reed",
            "contact_email": "elena.path@clinic.com",
            "contact_phone": "+1 555 333 1212",
            "source": "WEBSITE",
        },
    )
    assert create_resp.status_code == 201
    lead_id = create_resp.json()["id"]

    claim_resp = client.post(
        f"/api/leads/{lead_id}/owner?action=claim",
        headers=sales_headers,
    )
    assert claim_resp.status_code == 200

    for next_status in ["QUALIFIED", "CONTACTED"]:
        trans_resp = client.post(
            f"/api/leads/{lead_id}/transition",
            json={"new_status": next_status},
            headers=sales_headers,
        )
        assert trans_resp.status_code == 200
        assert trans_resp.json()["status"] == next_status

    scheduled_at = datetime.now(timezone.utc) + timedelta(days=3)
    consult_resp = client.post(
        f"/api/leads/{lead_id}/consultations",
        json={
            "scheduled_at": scheduled_at.isoformat(),
            "duration_minutes": 45,
            "location": "Google Meet",
            "meeting_link": "https://meet.google.com/test-sales-flow",
        },
        headers=sales_headers,
    )
    assert consult_resp.status_code == 201
    consult = consult_resp.json()
    assert consult["lead_id"] == lead_id
    assert consult["status"] == "SCHEDULED"
    assert consult["duration_minutes"] == 45
    assert consult["location"] == "Google Meet"

    # Transition to CONSULTATION_SCHEDULED is valid only after a scheduled booking exists.
    schedule_status_resp = client.post(
        f"/api/leads/{lead_id}/transition",
        json={"new_status": "CONSULTATION_SCHEDULED"},
        headers=sales_headers,
    )
    assert schedule_status_resp.status_code == 200
    assert schedule_status_resp.json()["status"] == "CONSULTATION_SCHEDULED"

    complete_consultation_resp = client.post(
        f"/api/leads/{lead_id}/consultations/latest/complete",
        headers=sales_headers,
    )
    assert complete_consultation_resp.status_code == 200
    assert complete_consultation_resp.json()["status"] == "COMPLETED"

    complete_status_resp = client.post(
        f"/api/leads/{lead_id}/transition",
        json={"new_status": "CONSULTATION_COMPLETED"},
        headers=sales_headers,
    )
    assert complete_status_resp.status_code == 200
    assert complete_status_resp.json()["status"] == "CONSULTATION_COMPLETED"


def test_consultation_creation_non_owner_forbidden(client: TestClient):
    """Non-owner sales user cannot create consultation for another agent's lead."""
    owner_headers = _sales_headers(client, "sales.agent@seed.com")
    other_sales_headers = _sales_headers(client, "sales.agent2@seed.com")

    create_resp = client.post(
        "/api/leads",
        json={
            "licence_number": "LC-002",
            "organization_name": "Consult Guard Medical",
            "contact_name": "Ivy Moss",
            "contact_email": "ivy.guard@clinic.com",
            "contact_phone": "+1 555 404 5050",
        },
    )
    assert create_resp.status_code == 201
    lead_id = create_resp.json()["id"]

    claim_resp = client.post(
        f"/api/leads/{lead_id}/owner?action=claim",
        headers=owner_headers,
    )
    assert claim_resp.status_code == 200

    forbidden_resp = client.post(
        f"/api/leads/{lead_id}/consultations",
        json={
            "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "duration_minutes": 30,
            "location": "Zoom",
        },
        headers=other_sales_headers,
    )
    assert forbidden_resp.status_code == 403
    assert "owner" in forbidden_resp.json().get("detail", "").lower()
