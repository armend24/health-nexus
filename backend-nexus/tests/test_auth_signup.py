"""
Pytest for POST /api/auth/signup using global-user registration semantics.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import Role, User
from app.auth.auth_utils import verify_password


@pytest.fixture
def client(db_session):
    """TestClient with required roles seeded for signup."""
    db_session.add_all(
        [
            Role(name="CLIENT"),
            Role(name="DOCTOR"),
            Role(name="SUPER_ADMIN"),
        ]
    )
    db_session.commit()
    yield TestClient(app)


def test_signup_success_creates_global_user(client):
    response = client.post(
        "/api/auth/signup",
        json={
            "email": "new@example.com",
            "password": "secret123",
            "first_name": "New",
            "last_name": "User",
            "role": "client",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "new@example.com"
    assert data["role"] == "CLIENT"
    assert "user_id" in data
    assert "tenant_id" not in data
    assert "password" not in data

    from app.db import SessionLocal

    session = SessionLocal()
    try:
        user = session.execute(select(User).where(User.email == "new@example.com")).scalar_one()
        assert user.first_name == "New"
        assert user.last_name == "User"
    finally:
        session.close()


def test_signup_duplicate_email_returns_409(client):
    payload = {
        "email": "dup@example.com",
        "password": "pass1234",
        "first_name": "D",
        "last_name": "U",
        "role": "client",
    }

    first = client.post("/api/auth/signup", json=payload)
    assert first.status_code == 201

    second = client.post("/api/auth/signup", json=payload)
    assert second.status_code == 409
    assert "already exists" in second.json().get("detail", "").lower()


def test_signup_role_not_found_returns_404(client):
    response = client.post(
        "/api/auth/signup",
        json={
            "email": "missing-role@example.com",
            "password": "pass1234",
            "first_name": "X",
            "last_name": "Y",
            "role": "unknown_role",
        },
    )

    assert response.status_code == 404
    assert "role" in response.json().get("detail", "").lower()


def test_signup_admin_alias_maps_to_super_admin(client):
    response = client.post(
        "/api/auth/signup",
        json={
            "email": "alias-admin@example.com",
            "password": "pass1234",
            "first_name": "A",
            "last_name": "D",
            "role": "admin",
        },
    )

    assert response.status_code == 201
    assert response.json()["role"] == "SUPER_ADMIN"


def test_signup_invalid_password_returns_422(client):
    base = {
        "email": "v@example.com",
        "first_name": "V",
        "last_name": "V",
        "role": "client",
    }

    r_short = client.post("/api/auth/signup", json={**base, "password": "short1"})
    assert r_short.status_code == 422

    r_no_letter = client.post("/api/auth/signup", json={**base, "password": "12345678"})
    assert r_no_letter.status_code == 422

    r_no_digit = client.post("/api/auth/signup", json={**base, "password": "password"})
    assert r_no_digit.status_code == 422


def test_signup_password_is_hashed_in_db(client):
    plain = "mypass123"
    response = client.post(
        "/api/auth/signup",
        json={
            "email": "hashed@example.com",
            "password": plain,
            "first_name": "H",
            "last_name": "U",
            "role": "client",
        },
    )
    assert response.status_code == 201

    from app.db import SessionLocal

    session = SessionLocal()
    try:
        user = session.execute(select(User).where(User.email == "hashed@example.com")).scalar_one()
        assert user.password != plain
        assert verify_password(plain, user.password) is True
    finally:
        session.close()
