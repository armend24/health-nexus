"""
Integration tests for auth RBAC, refresh, and logout.
Matches current auth implementation using require_role().
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Role, User
from app.auth.auth_utils import hash_password


@pytest.fixture
def client(db_session):
    """
    Seed real roles and users matching system RBAC.
    """

    # Create roles matching production roles
    super_admin_role = Role(name="SUPER_ADMIN")
    doctor_role = Role(name="DOCTOR")

    db_session.add(super_admin_role)
    db_session.add(doctor_role)
    db_session.flush()

    # Create users
    admin_user = User(
        first_name="Admin",
        last_name="User",
        email="admin@test.com",
        password=hash_password("adminpass"),
        role_id=super_admin_role.id,
    )

    doctor_user = User(
        first_name="Doctor",
        last_name="User",
        email="doctor@test.com",
        password=hash_password("doctorpass"),
        role_id=doctor_role.id,
    )

    db_session.add(admin_user)
    db_session.add(doctor_user)
    db_session.commit()

    yield TestClient(app)


# -----------------------------
# Admin Endpoint RBAC Tests
# -----------------------------


def test_get_auth_admin_without_auth_returns_403(client):
    response = client.get("/api/auth/admin")
    assert response.status_code == 403


def test_get_auth_admin_as_doctor_returns_403(client):
    login_resp = client.post(
        "/api/auth/login",
        json={
            "email": "doctor@test.com",
            "password": "doctorpass",
        },
    )

    assert login_resp.status_code == 200

    access_token = login_resp.json()["access_token"]

    response = client.get(
        "/api/auth/admin",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 403


def test_get_auth_admin_as_super_admin_returns_200(client):
    login_resp = client.post(
        "/api/auth/login",
        json={
            "email": "admin@test.com",
            "password": "adminpass",
        },
    )

    assert login_resp.status_code == 200

    access_token = login_resp.json()["access_token"]

    response = client.get(
        "/api/auth/admin",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200


# -----------------------------
# Refresh + Logout Tests
# -----------------------------


def test_refresh_returns_new_access_token(client):
    login_resp = client.post(
        "/api/auth/login",
        json={
            "email": "doctor@test.com",
            "password": "doctorpass",
        },
    )

    assert login_resp.status_code == 200

    refresh_token = login_resp.json()["refresh_token"]

    response = client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )

    assert response.status_code == 200
    assert "access_token" in response.json()


def test_logout_revokes_refresh_token(client):
    login_resp = client.post(
        "/api/auth/login",
        json={
            "email": "doctor@test.com",
            "password": "doctorpass",
        },
    )

    assert login_resp.status_code == 200

    refresh_token = login_resp.json()["refresh_token"]

    logout_resp = client.post(
        "/api/auth/logout",
        json={"refresh_token": refresh_token},
    )

    assert logout_resp.status_code == 200

    refresh_resp = client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )

    assert refresh_resp.status_code == 401
