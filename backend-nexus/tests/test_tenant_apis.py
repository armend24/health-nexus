"""
Tests for tenant management APIs. Uses token-based auth (tenant_id from JWT).
Requires: TENANT_MANAGER user linked to a tenant via TenantManager.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed import run_seed


@pytest.fixture
def client():
    """TestClient with seeded DB (tenant.manager@seed.com -> Bluestone Clinic)."""
    run_seed()
    yield TestClient(app)


@pytest.fixture
def tenant_auth(client):
    """Login as tenant manager, return (access_token, tenant_id)."""
    resp = client.post(
        "/api/auth/login",
        json={"email": "tenant.manager@seed.com", "password": "Team2026@"},
    )
    assert resp.status_code == 200
    data = resp.json()
    token = data["access_token"]
    # tenant_id is in JWT; we know from seed Bluestone Clinic is first approved tenant (id=1)
    return token


@pytest.fixture
def auth_headers(tenant_auth):
    """Authorization headers for tenant APIs."""
    return {"Authorization": f"Bearer {tenant_auth}"}


def test_get_tenant_details_without_auth_returns_401_or_403(client):
    """GET /api/tenants/details without token returns 401 or 403."""
    resp = client.get("/api/tenants/details")
    # HTTPBearer returns 403 when credentials missing
    assert resp.status_code in (401, 403)


def test_get_tenant_details_with_auth(client, auth_headers):
    """GET /api/tenants/details returns tenant details."""
    resp = client.get("/api/tenants/details", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "tenant_id" in data
    assert "moto" in data
    assert "logo" in data
    assert data.get("moto") == "Your health, our priority"


def test_put_tenant_details(client, auth_headers):
    """PUT /api/tenants/details updates details."""
    payload = {"moto": "Updated motto for testing"}
    resp = client.put("/api/tenants/details", data=payload, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["moto"] == "Updated motto for testing"

    # Verify persistent
    get_resp = client.get("/api/tenants/details", headers=auth_headers)
    assert get_resp.json()["moto"] == "Updated motto for testing"


def test_get_tenant_current(client, auth_headers):
    """GET /api/tenants/current returns tenant landing info."""
    resp = client.get("/api/tenants/current", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data or "name" in data
    assert data.get("name") == "Bluestone Clinic"


def test_list_tenant_doctors(client, auth_headers):
    """GET /api/tenants/doctors returns doctors for tenant."""
    resp = client.get("/api/tenants/doctors", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    # Bluestone has 2 doctors (doctor.one, doctor.two)
    assert len(data) >= 2
    first = data[0]
    assert "user_id" in first
    assert "specialization" in first
    assert "tenant_id" in first


def test_create_tenant_doctor(client, auth_headers):
    """POST /api/tenants/doctors creates doctor from user with DOCTOR role."""
    # doctor.six is DOCTOR and not yet assigned to Bluestone (assigned to Apex in seed)
    # We need an unassigned doctor. From seed: doctor.one,two -> Bluestone; three,four -> Riverside; five,six -> Apex
    # So all doctors are assigned. Create a new doctor user first - actually we can't easily. Use doctor.six - he's on Apex.
    # We need a doctor NOT yet in any tenant. The seed assigns all 6 doctors. So we need to add a 7th doctor user.
    # Simplest: add a new User with DOCTOR role, then POST to create doctor.
    from app.db import SessionLocal
    from app.models import User, Role, Doctor
    from app.auth.auth_utils import hash_password

    session = SessionLocal()
    try:
        doctor_role = session.query(Role).filter(Role.name == "DOCTOR").first()
        new_doctor_user = User(
            first_name="Test",
            last_name="Doctor",
            email="test.doctor@test.com",
            password=hash_password("pass"),
            role_id=doctor_role.id,
        )
        session.add(new_doctor_user)
        session.commit()
        session.refresh(new_doctor_user)
        user_id = new_doctor_user.id
    finally:
        session.close()

    payload = {
        "user_id": user_id,
        "specialization": "Test Specialization",
        "licence_number": "MD-TEST-001",
    }
    resp = client.post("/api/tenants/doctors", json=payload, headers=auth_headers)
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["user_id"] == user_id
    assert data["specialization"] == "Test Specialization"


def test_create_tenant_doctor_duplicate_returns_409(client, auth_headers):
    """POST /api/tenants/doctors with user already assigned returns 409."""
    # doctor.one is already on Bluestone
    resp = client.get("/api/tenants/doctors", headers=auth_headers)
    doctors = resp.json()
    assert len(doctors) >= 1
    user_id = doctors[0]["user_id"]

    payload = {"user_id": user_id, "specialization": "Duplicate"}
    resp = client.post("/api/tenants/doctors", json=payload, headers=auth_headers)
    assert resp.status_code == 409


def test_update_tenant_doctor(client, auth_headers):
    """PUT /api/tenants/doctors/{user_id} updates doctor."""
    resp = client.get("/api/tenants/doctors", headers=auth_headers)
    doctors = resp.json()
    assert len(doctors) >= 1
    user_id = doctors[0]["user_id"]

    payload = {"specialization": "Updated Specialization"}
    resp = client.put(f"/api/tenants/doctors/{user_id}", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["specialization"] == "Updated Specialization"


def test_delete_tenant_doctor(client, auth_headers):
    """DELETE /api/tenants/doctors/{user_id} removes doctor."""
    from app.db import SessionLocal
    from app.models import User, Role, Doctor, Tenant, TenantDepartment
    from app.auth.auth_utils import hash_password

    session = SessionLocal()
    try:
        doctor_role = session.query(Role).filter(Role.name == "DOCTOR").first()
        bluestone = session.query(Tenant).filter(Tenant.name == "Bluestone Clinic").first()
        tenant_department = (
            session.query(TenantDepartment)
            .filter(TenantDepartment.tenant_id == bluestone.id)
            .order_by(TenantDepartment.id.asc())
            .first()
        )
        new_user = User(
            first_name="Del",
            last_name="Doc",
            email="del.doctor@test.com",
            password=hash_password("pass"),
            role_id=doctor_role.id,
        )
        session.add(new_user)
        session.flush()
        session.add(
            Doctor(
                user_id=new_user.id,
                tenant_id=bluestone.id,
                tenant_department_id=tenant_department.id,
                specialization="ToDelete",
            )
        )
        session.commit()
        session.refresh(new_user)
        user_id = new_user.id
    finally:
        session.close()

    resp = client.delete(f"/api/tenants/doctors/{user_id}", headers=auth_headers)
    assert resp.status_code == 204

    get_resp = client.get("/api/tenants/doctors", headers=auth_headers)
    ids = [d["user_id"] for d in get_resp.json()]
    assert user_id not in ids


def test_list_tenant_departments(client, auth_headers):
    """GET /api/tenants/departments returns tenant departments with services."""
    resp = client.get("/api/tenants/departments", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    # Bluestone has General Practice, Cardiology
    assert len(data) >= 2
    first = data[0]
    assert "department_name" in first
    assert "services" in first


def test_post_tenant_departments_bulk(client, auth_headers):
    """POST /api/tenants/departments bulk sets departments."""
    resp = client.get("/api/tenants/departments", headers=auth_headers)
    existing = resp.json()

    from app.db import SessionLocal
    from app.models import Department

    session = SessionLocal()
    depts = session.query(Department).limit(2).all()
    session.close()
    assert len(depts) >= 2

    existing_by_department_id = {d["department_id"]: d for d in existing}
    items = []
    for index, dept in enumerate(depts[:2]):
        current = existing_by_department_id.get(dept.id, {})
        item = {
            "department_id": dept.id,
            "phone_number": "+1-555-9999" if index == 0 else current.get("phone_number"),
            "location": "Test" if index == 0 else current.get("location"),
        }
        if current.get("email") is not None:
            item["email"] = current["email"]
        items.append(item)

    for existing_item in existing:
        if existing_item["department_id"] not in {item["department_id"] for item in items}:
            item = {
                "department_id": existing_item["department_id"],
                "phone_number": existing_item.get("phone_number"),
                "location": existing_item.get("location"),
            }
            if existing_item.get("email") is not None:
                item["email"] = existing_item["email"]
            items.append(item)

    resp = client.post("/api/tenants/departments", json={"items": items}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 2


def test_delete_tenant_department(client, auth_headers):
    """DELETE /api/tenants/departments/{id} removes department."""
    from app.db import SessionLocal
    from app.models import Department, Tenant, TenantDepartment

    session = SessionLocal()
    try:
        tenant = session.query(Tenant).filter(Tenant.name == "Bluestone Clinic").first()
        department = Department(name="Disposable Department")
        session.add(department)
        session.flush()
        tenant_department = TenantDepartment(
            tenant_id=tenant.id,
            department_id=department.id,
            phone_number="+1-555-0000",
        )
        session.add(tenant_department)
        session.commit()
        td_id = tenant_department.id
    finally:
        session.close()

    resp = client.delete(f"/api/tenants/departments/{td_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Re-add for other tests (optional - each test gets fresh DB)


def test_list_tenant_products(client, auth_headers):
    """GET /api/tenants/products returns products."""
    resp = client.get("/api/tenants/products", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    # Bluestone has 5 products
    assert len(data) >= 5


def test_create_tenant_product(client, auth_headers):
    """POST /api/tenants/products creates product."""
    payload = {
        "name": "Test Product",
        "description": "Test desc",
        "price": 99.99,
        "stock_quantity": 10,
        "is_available": True,
    }
    resp = client.post("/api/tenants/products", json=payload, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Product"
    assert float(data["price"]) == 99.99
    product_id = data["product_id"]


def test_update_tenant_product(client, auth_headers):
    """PUT /api/tenants/products/{id} updates product."""
    # Create then update
    create_resp = client.post(
        "/api/tenants/products",
        json={"name": "Updatable", "price": 10, "stock_quantity": 0},
        headers=auth_headers,
    )
    assert create_resp.status_code == 201
    pid = create_resp.json()["product_id"]

    resp = client.put(
        f"/api/tenants/products/{pid}",
        json={"name": "Updated Name", "price": 20},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"
    assert float(resp.json()["price"]) == 20


def test_delete_tenant_product(client, auth_headers):
    """DELETE /api/tenants/products/{id} removes product."""
    create_resp = client.post(
        "/api/tenants/products",
        json={"name": "To Delete", "price": 1, "stock_quantity": 0},
        headers=auth_headers,
    )
    assert create_resp.status_code == 201
    pid = create_resp.json()["product_id"]

    resp = client.delete(f"/api/tenants/products/{pid}", headers=auth_headers)
    assert resp.status_code == 204

    get_resp = client.get("/api/tenants/products", headers=auth_headers)
    ids = [p["product_id"] for p in get_resp.json()]
    assert pid not in ids


def test_list_products_via_catalog_api_for_tenant_manager(client, auth_headers):
    """GET /api/products respects the tenant manager tenant from JWT."""
    current_resp = client.get("/api/tenants/current", headers=auth_headers)
    assert current_resp.status_code == 200
    tenant_id = current_resp.json()["id"]

    resp = client.get(
        f"/api/products?tenant_id={tenant_id}&page=1&size=20",
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["items"]
    assert all(item["tenant_id"] == tenant_id for item in data["items"])


def test_create_and_update_product_via_catalog_api_for_tenant_manager(
    client, auth_headers
):
    """POST/PUT /api/products use the tenant manager tenant from JWT."""
    current_resp = client.get("/api/tenants/current", headers=auth_headers)
    assert current_resp.status_code == 200
    tenant_id = current_resp.json()["id"]

    create_resp = client.post(
        "/api/products",
        json={
            "tenant_id": tenant_id,
            "name": "Catalog API Product",
            "description": "Created through /api/products",
            "category": "supplements",
            "image_url": None,
            "price": 14.5,
            "stock_quantity": 6,
            "is_available": True,
        },
        headers=auth_headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["tenant_id"] == tenant_id

    update_resp = client.put(
        f"/api/products/{created['product_id']}",
        json={
            "name": "Updated Catalog API Product",
            "price": 18.0,
            "stock_quantity": 4,
        },
        headers=auth_headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["name"] == "Updated Catalog API Product"
    assert float(updated["price"]) == 18.0
    assert updated["stock_quantity"] == 4


def test_list_products_filters_by_string_category(client, auth_headers):
    """GET /api/products treats category as a string query param."""
    current_resp = client.get("/api/tenants/current", headers=auth_headers)
    assert current_resp.status_code == 200
    tenant_id = current_resp.json()["id"]

    client.post(
        "/api/products",
        json={
            "tenant_id": tenant_id,
            "name": "Category Filter Vitamins",
            "description": "Test",
            "category": "Vitamins",
            "image_url": None,
            "price": 7.0,
            "stock_quantity": 3,
            "is_available": True,
        },
        headers=auth_headers,
    )

    resp = client.get(
        f"/api/products?tenant_id={tenant_id}&category=Vitamins&page=1&size=20",
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["items"]
    assert all(item["category"] == "Vitamins" for item in data["items"])


def test_list_tenant_services(client, auth_headers):
    """GET /api/tenants/services returns services."""
    resp = client.get("/api/tenants/services", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    # Bluestone has 6 services
    assert len(data) >= 6


def test_get_tenant_service_by_id(client, auth_headers):
    """GET /api/tenants/services/{id} returns single service."""
    list_resp = client.get("/api/tenants/services", headers=auth_headers)
    services = list_resp.json()
    assert len(services) >= 1
    sid = services[0]["id"]

    resp = client.get(f"/api/tenants/services/{sid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == sid


def test_create_tenant_service(client, auth_headers):
    """POST /api/tenants/services creates service under tenant department."""
    dept_resp = client.get("/api/tenants/departments", headers=auth_headers)
    depts = dept_resp.json()
    assert len(depts) >= 1
    # Services are under tenant_department; we need tenant_department_id
    # TenantDepartmentWithServicesRead has id = tenant_department id
    td_id = depts[0]["id"]

    payload = {
        "tenant_department_id": td_id,
        "name": "New Test Service",
        "price": 88.50,
        "description": "Test service",
    }
    resp = client.post("/api/tenants/services", json=payload, headers=auth_headers)
    assert resp.status_code in (200, 201)
    assert resp.json()["name"] == "New Test Service"


def test_update_tenant_service(client, auth_headers):
    """PUT /api/tenants/services/{id} updates service."""
    list_resp = client.get("/api/tenants/services", headers=auth_headers)
    services = list_resp.json()
    sid = services[0]["id"]

    resp = client.put(
        f"/api/tenants/services/{sid}",
        json={"name": "Updated Service", "price": 100},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Service"


def test_delete_tenant_service(client, auth_headers):
    """DELETE /api/tenants/services/{id} removes service."""
    # Create a service first
    dept_resp = client.get("/api/tenants/departments", headers=auth_headers)
    td_id = dept_resp.json()[0]["id"]
    create_resp = client.post(
        "/api/tenants/services",
        json={"tenant_department_id": td_id, "name": "To Delete Service", "price": 50},
        headers=auth_headers,
    )
    assert create_resp.status_code in (200, 201)
    sid = create_resp.json()["id"]

    resp = client.delete(f"/api/tenants/services/{sid}", headers=auth_headers)
    assert resp.status_code == 204


def test_tenant_api_without_tenant_in_token_returns_403(client):
    """User without tenant_id in JWT (e.g. SUPER_ADMIN) gets 403 on tenant routes."""
    login_resp = client.post(
        "/api/auth/login",
        json={"email": "super.admin@seed.com", "password": "Team2026@"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    resp = client.get("/api/tenants/details", headers={"Authorization": f"Bearer {token}"})
    # require_tenant_from_token expects tenant_id in payload; super admin has no tenant
    assert resp.status_code == 403
