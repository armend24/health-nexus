import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.auth.auth_utils import create_access_token
from app.main import app
from app.models import Patient, Tenant, TenantStatus, User
from app.models.base import Base
from app.routes.public_tenant import get_db as public_tenant_get_db

TEST_DATABASE_URL = "sqlite+pysqlite:///./.pytest_tenant_client_registration.db"
test_engine = create_engine(TEST_DATABASE_URL, future=True)
TestSessionLocal = sessionmaker(
    bind=test_engine,
    autoflush=False,
    autocommit=False,
    future=True,
)


def _override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function", autouse=True)
def reset_database():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[public_tenant_get_db] = _override_get_db
    try:
        yield
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client():
    session = TestSessionLocal()
    try:
        tenant_a = Tenant(
            name="Tenant A",
            email="tenant-a@example.com",
            licence_number="TEN-A-001",
            status=TenantStatus.approved,
        )
        tenant_b = Tenant(
            name="Tenant B",
            email="tenant-b@example.com",
            licence_number="TEN-B-001",
            status=TenantStatus.approved,
        )
        session.add_all([tenant_a, tenant_b])
        session.commit()
    finally:
        session.close()
    yield TestClient(app)


def test_register_new_email_in_tenant_success(client):
    response = client.post(
        "/api/public/tenants/1/clients/register",
        json={
            "email": "new-client@example.com",
            "first_name": "New",
            "last_name": "Client",
            "password": "Pass12345",
            "birthdate": "1990-01-01",
            "gender": "female",
            "blood_type": "O+",
            "tenant_id": 999,
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["tenant_id"] == 1
    assert data["user_id"] == data["patient_id"]

    session = TestSessionLocal()
    try:
        user = session.execute(
            select(User).where(User.email == "new-client@example.com")
        ).scalar_one()
        patient = session.execute(
            select(Patient).where(Patient.user_id == user.id, Patient.tenant_id == 1)
        ).scalar_one()
        assert patient.tenant_id == 1
    finally:
        session.close()


def test_register_same_email_same_tenant_returns_409(client):
    payload = {
        "email": "duplicate-client@example.com",
        "first_name": "Dup",
        "last_name": "Client",
        "password": "Pass12345",
    }
    first = client.post("/api/public/tenants/1/clients/register", json=payload)
    assert first.status_code == 201

    second = client.post("/api/public/tenants/1/clients/register", json=payload)
    assert second.status_code == 409
    detail = second.json()["detail"]
    assert detail["code"] == "EMAIL_ALREADY_REGISTERED"
    assert detail["message"] == "Email already registered in this tenant"


def test_register_same_email_different_tenant_succeeds(client):
    payload = {
        "email": "cross-tenant@example.com",
        "first_name": "Cross",
        "last_name": "Tenant",
        "password": "Pass12345",
    }
    tenant_a = client.post("/api/public/tenants/1/clients/register", json=payload)
    assert tenant_a.status_code == 201
    tenant_b = client.post("/api/public/tenants/2/clients/register", json=payload)
    assert tenant_b.status_code == 201

    data_a = tenant_a.json()
    data_b = tenant_b.json()
    assert data_a["user_id"] == data_b["user_id"]
    assert data_a["tenant_id"] == 1
    assert data_b["tenant_id"] == 2


def test_register_invalid_tenant_returns_404(client):
    response = client.post(
        "/api/public/tenants/99999/clients/register",
        json={
            "email": "missing-tenant@example.com",
            "first_name": "No",
            "last_name": "Tenant",
            "password": "Pass12345",
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Tenant not found"


def test_patient_rows_always_include_tenant_id(client):
    payload = {
        "email": "tenant-isolation@example.com",
        "first_name": "Tenant",
        "last_name": "Isolation",
        "password": "Pass12345",
    }
    assert client.post("/api/public/tenants/1/clients/register", json=payload).status_code == 201
    assert client.post("/api/public/tenants/2/clients/register", json=payload).status_code == 201

    session = TestSessionLocal()
    try:
        patients = session.execute(select(Patient)).scalars().all()
        assert len(patients) == 2
        assert all(patient.tenant_id is not None for patient in patients)
        assert {patient.tenant_id for patient in patients} == {1, 2}
        assert len({patient.user_id for patient in patients}) == 1
    finally:
        session.close()


def test_authenticated_client_can_register_in_another_tenant(client):
    payload = {
        "email": "seeded-client@example.com",
        "first_name": "Seeded",
        "last_name": "Client",
        "password": "Pass12345",
    }
    first = client.post("/api/public/tenants/1/clients/register", json=payload)
    assert first.status_code == 201

    token = create_access_token(
        {
            "user_id": first.json()["user_id"],
            "email": payload["email"],
            "role": "CLIENT",
            "tenant_id": 1,
        }
    )
    second = client.post(
        "/api/public/tenants/2/clients/register",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert second.status_code == 201
    assert second.json()["tenant_id"] == 2


def test_authenticated_client_cannot_register_different_email(client):
    payload = {
        "email": "seeded-client@example.com",
        "first_name": "Seeded",
        "last_name": "Client",
        "password": "Pass12345",
    }
    first = client.post("/api/public/tenants/1/clients/register", json=payload)
    assert first.status_code == 201

    token = create_access_token(
        {
            "user_id": first.json()["user_id"],
            "email": payload["email"],
            "role": "CLIENT",
            "tenant_id": 1,
        }
    )
    mismatched = client.post(
        "/api/public/tenants/2/clients/register",
        json={
            **payload,
            "email": "someone-else@example.com",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert mismatched.status_code == 403
    assert mismatched.json()["detail"] == "Email does not match authenticated user"
