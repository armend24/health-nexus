# Tenant entity routes. Public + management (details, doctors, departments) under /api/tenants.

from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user, require_tenant_from_token
from app.auth.auth_utils import require_tenant_from_token
from app.routes.feature_flag import require_feature
from app.db import get_db
from app.models.patient import Patient
from app.models.tenant import Tenant, TenantStatus
from app.models.tenant_details import TenantDetails
from app.models.department import Department
from app.models.tenant_department import TenantDepartment
from app.models.service import Service
from app.models.product import Product
from app.models.font import Font
from app.models.doctor import Doctor
from app.models.role import Role
from app.models.user import User

from app.schemas.tenant_details import TenantDetailsRead
from app.schemas.doctor import (
    DoctorCreateForTenant,
    DoctorRead,
    DoctorReadWithName,
    DoctorUpdate,
)
from app.schemas.patient_schema import PatientMeResponse, PatientMeUpdateRequest
from app.schemas.tenant_department import (
    TenantDepartmentRead,
    TenantDepartmentWithServicesRead,
    BulkDepartmentsRequest,
)
from app.schemas.product import ProductRead, ProductCreateForTenant, ProductUpdate
from app.schemas.service import ServiceCreateInput, ServiceUpdate, ServiceRead
from app.schemas.landing import (
    TenantLandingPageResponse,
    TenantLandingRead,
    TenantDetailsLandingRead,
    DepartmentLandingItem,
    ServiceLandingItem,
    DoctorLandingItem,
    ProductLandingItem,
    PlanLandingItem,
    TenantPublicCard,
)
from app.models.user_tenant_plan import UserTenantPlan
from app.lib.storage import save_tenant_brand_asset
from app.routes.public_tenant import _TENANT_NOT_ACTIVE_DETAIL

router = APIRouter(prefix="/tenants", tags=["Tenants"])


@router.get("", response_model=list[TenantPublicCard])
def list_active_tenants(db: Session = Depends(get_db)):
    """Returns approved tenants only for public display: id, slug, name, moto, about_text, logo, image, and palette."""
    tenants = (
        db.query(Tenant).filter(Tenant.status == TenantStatus.approved).order_by(Tenant.name).all()
    )
    result = []
    for t in tenants:
        details = db.query(TenantDetails).filter(TenantDetails.tenant_id == t.id).first()
        brand = details.brand if details else None
        result.append(
            TenantPublicCard(
                id=t.id,
                slug=t.slug,
                name=t.name,
                moto=details.moto if details else None,
                about_text=details.about_text if details else None,
                logo=details.logo if details else None,
                image=details.image if details else None,
                brand_color_primary=brand.brand_color_primary if brand else None,
                brand_color_secondary=brand.brand_color_secondary if brand else None,
                brand_color_background=brand.brand_color_background if brand else None,
                brand_color_foreground=brand.brand_color_foreground if brand else None,
                brand_color_muted=brand.brand_color_muted if brand else None,
            )
        )
    return result


@router.get("/by-slug/{slug}/landing", response_model=TenantLandingPageResponse)
def get_tenant_landing_by_slug(slug: str, db: Session = Depends(get_db)):
    """Returns tenant, details, departments (with services), and doctors for landing page by slug."""
    tenant = db.query(Tenant).filter(Tenant.slug == slug).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.status != TenantStatus.approved:
        raise HTTPException(
            status_code=403, detail="Landing page is only available for approved tenants"
        )

    tenant_id = tenant.id
    details = db.query(TenantDetails).filter(TenantDetails.tenant_id == tenant_id).first()
    details_read = None
    if details:
        font = (
            db.query(Font).filter(Font.id == details.font_id).first() if details.font_id else None
        )
        brand = details.brand if details.brand_id else None
        details_read = TenantDetailsLandingRead(
            tenant_id=details.tenant_id,
            logo=details.logo,
            image=details.image,
            moto=details.moto,
            brand_color_primary=brand.brand_color_primary if brand else None,
            brand_color_secondary=brand.brand_color_secondary if brand else None,
            brand_color_background=brand.brand_color_background if brand else None,
            brand_color_foreground=brand.brand_color_foreground if brand else None,
            brand_color_muted=brand.brand_color_muted if brand else None,
            title=details.title,
            about_text=details.about_text,
            font_id=details.font_id,
            font_name=font.name if font else None,
            font_header_family=font.header_font_family if font else None,
            font_body_family=font.body_font_family if font else None,
        )

    tenant_deps = db.query(TenantDepartment).filter(TenantDepartment.tenant_id == tenant_id).all()
    departments: list[DepartmentLandingItem] = []
    for td in tenant_deps:
        dept = db.query(Department).filter(Department.id == td.department_id).first()
        services = (
            db.query(Service)
            .filter(
                Service.tenant_departments_id == td.id,
                Service.is_active == True,
            )
            .all()
        )
        departments.append(
            DepartmentLandingItem(
                id=td.id,
                name=dept.name if dept else "",
                phone_number=td.phone_number,
                email=td.email,
                location=td.location,
                services=[ServiceLandingItem.model_validate(s) for s in services],
            )
        )

    doctors_q = (
        db.query(Doctor, User)
        .join(User, Doctor.user_id == User.id)
        .filter(Doctor.tenant_id == tenant_id, Doctor.is_active == True)
        .all()
    )
    doctors = [
        DoctorLandingItem(
            user_id=d.user_id,
            first_name=u.first_name or "",
            last_name=u.last_name or "",
            specialization=d.specialization,
            education=d.education,
            licence_number=d.licence_number,
            is_active=d.is_active,
            working_hours=d.working_hours,
        )
        for d, u in doctors_q
    ]

    products = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.is_available == True)
        .order_by(Product.name)
        .all()
    )

    plans = (
        db.query(UserTenantPlan)
        .filter(UserTenantPlan.tenant_id == tenant_id, UserTenantPlan.is_active == True)
        .order_by(UserTenantPlan.price)
        .all()
    )

    return TenantLandingPageResponse(
        tenant=TenantLandingRead.model_validate(tenant),
        details=details_read,
        departments=departments,
        doctors=doctors,
        products=[ProductLandingItem.model_validate(p) for p in products],
        plans=[PlanLandingItem.model_validate(p) for p in plans],
    )


def _list_tenant_departments(db: Session, tenant_id: int) -> list:
    tenant_deps = db.query(TenantDepartment).filter(TenantDepartment.tenant_id == tenant_id).all()
    result = []
    for td in tenant_deps:
        dept = db.query(Department).filter(Department.id == td.department_id).first()
        services = (
            db.query(Service)
            .filter(Service.tenant_departments_id == td.id, Service.is_active == True)
            .all()
        )
        result.append(
            TenantDepartmentWithServicesRead(
                **TenantDepartmentRead.model_validate(td).model_dump(),
                department_name=dept.name if dept else "",
                services=[ServiceLandingItem.model_validate(s) for s in services],
            )
        )
    return result


def _bulk_set_tenant_departments(
    db: Session, tenant_id: int, payload: BulkDepartmentsRequest
) -> list:
    _assert_tenant_exists(db, tenant_id)
    seen_dept_ids = set()
    for item in payload.items:
        if item.department_id in seen_dept_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate department_id {item.department_id} in payload",
            )
        seen_dept_ids.add(item.department_id)
        dept = db.query(Department).filter(Department.id == item.department_id).first()
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Department {item.department_id} not found",
            )

    existing_tds = {
        td.department_id: td
        for td in db.query(TenantDepartment).filter(TenantDepartment.tenant_id == tenant_id).all()
    }
    target_dept_ids = {item.department_id for item in payload.items}

    for dept_id, td in list(existing_tds.items()):
        if dept_id not in target_dept_ids:
            db.delete(td)
    db.flush()

    result = []
    for item in payload.items:
        td = existing_tds.get(item.department_id)
        if td:
            td.phone_number = item.phone_number
            td.email = item.email
            td.location = item.location
        else:
            td = TenantDepartment(
                tenant_id=tenant_id,
                department_id=item.department_id,
                phone_number=item.phone_number,
                email=item.email,
                location=item.location,
            )
            db.add(td)
            db.flush()

        dept = db.query(Department).filter(Department.id == td.department_id).first()
        services = (
            db.query(Service)
            .filter(Service.tenant_departments_id == td.id, Service.is_active == True)
            .all()
        )
        result.append(
            TenantDepartmentWithServicesRead(
                **TenantDepartmentRead.model_validate(td).model_dump(),
                department_name=dept.name if dept else "",
                services=[ServiceLandingItem.model_validate(s) for s in services],
            )
        )

    db.commit()
    return result


def _assert_tenant_exists(db: Session, tenant_id: int) -> None:
    if not db.query(Tenant).filter(Tenant.id == tenant_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")


def _get_current_user_id_or_401(current_user: dict) -> int:
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    try:
        return int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def _get_tenant_or_404(db: Session, tenant_id: int) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    return tenant


def _assert_tenant_approved_or_403(tenant: Tenant) -> None:
    if tenant.status != TenantStatus.approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_TENANT_NOT_ACTIVE_DETAIL,
        )


@router.get("/{tenant_id}/patients/me", response_model=PatientMeResponse)
def get_patient_me_for_tenant(
    tenant_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = _get_current_user_id_or_401(current_user)
    tenant = _get_tenant_or_404(db, tenant_id)
    _assert_tenant_approved_or_403(tenant)

    patient = (
        db.query(Patient)
        .filter(
            Patient.tenant_id == tenant_id,
            Patient.user_id == user_id,
        )
        .first()
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    return patient


@router.patch("/{tenant_id}/patients/me", response_model=PatientMeResponse)
def patch_patient_me_for_tenant(
    tenant_id: int,
    payload: PatientMeUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = _get_current_user_id_or_401(current_user)
    tenant = _get_tenant_or_404(db, tenant_id)
    _assert_tenant_approved_or_403(tenant)

    patient = (
        db.query(Patient)
        .filter(
            Patient.tenant_id == tenant_id,
            Patient.user_id == user_id,
        )
        .first()
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(patient, field, value)

    db.commit()
    db.refresh(patient)
    return patient


# ─── Tenant management (tenant_id from JWT token) ───


@router.get("/current", response_model=TenantLandingRead)
def get_current_tenant(
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Get current tenant profile from JWT tenant_id."""
    _, tenant_id = auth
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return TenantLandingRead.model_validate(tenant)


@router.get("/details", response_model=TenantDetailsRead)
def get_tenant_details(
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Get current user's tenant details (tenant_id from JWT)."""
    _, tenant_id = auth
    _assert_tenant_exists(db, tenant_id)
    details = db.query(TenantDetails).filter(TenantDetails.tenant_id == tenant_id).first()
    if not details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant details not found"
        )
    return details


@router.put(
    "/details",
    response_model=TenantDetailsRead,
    dependencies=[Depends(require_feature("custom_branding"))],
)
async def upsert_tenant_details(
    logo: UploadFile | None = File(default=None),
    image: UploadFile | None = File(default=None),
    logo_url: str | None = Form(default=None),
    image_url: str | None = Form(default=None),
    clear_logo: bool = Form(default=False),
    clear_image: bool = Form(default=False),
    moto: str | None = Form(default=None),
    brand_id: int | None = Form(default=None),
    font_id: int | None = Form(default=None),
    title: str | None = Form(default=None),
    about_text: str | None = Form(default=None),
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Upsert current user's tenant details (tenant_id from JWT)."""
    allowed_image_types = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    max_image_size_bytes = 5 * 1024 * 1024  # 5MB

    _, tenant_id = auth
    _assert_tenant_exists(db, tenant_id)
    details = db.query(TenantDetails).filter(TenantDetails.tenant_id == tenant_id).first()

    if details is None:
        details = TenantDetails(tenant_id=tenant_id)
        db.add(details)

    if logo_url is not None:
        details.logo = logo_url
    if image_url is not None:
        details.image = image_url
    if clear_logo:
        details.logo = None
    if clear_image:
        details.image = None

    if moto is not None:
        details.moto = moto
    if brand_id is not None:
        details.brand_id = brand_id
    if font_id is not None:
        details.font_id = font_id
    if title is not None:
        details.title = title
    if about_text is not None:
        details.about_text = about_text

    if logo is not None:
        logo_content = await logo.read()
        if not logo_content:
            raise HTTPException(status_code=400, detail="Logo image is empty")
        if len(logo_content) > max_image_size_bytes:
            raise HTTPException(status_code=400, detail="Logo image must be under 5MB")
        logo_content_type = (logo.content_type or "").lower()
        if logo_content_type not in allowed_image_types:
            raise HTTPException(status_code=400, detail="Logo image type is not supported")
        details.logo = save_tenant_brand_asset(
            tenant_id=tenant_id,
            kind="logo",
            content=logo_content,
            content_type=logo_content_type,
        )

    if image is not None:
        image_content = await image.read()
        if not image_content:
            raise HTTPException(status_code=400, detail="Hero image is empty")
        if len(image_content) > max_image_size_bytes:
            raise HTTPException(status_code=400, detail="Hero image must be under 5MB")
        image_content_type = (image.content_type or "").lower()
        if image_content_type not in allowed_image_types:
            raise HTTPException(status_code=400, detail="Hero image type is not supported")
        details.image = save_tenant_brand_asset(
            tenant_id=tenant_id,
            kind="hero",
            content=image_content,
            content_type=image_content_type,
        )

    db.commit()
    db.refresh(details)
    return details


@router.get("/doctors", response_model=list[DoctorReadWithName])
def list_tenant_doctors(
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """List current user's tenant doctors (tenant_id from JWT)."""
    _, tenant_id = auth
    _assert_tenant_exists(db, tenant_id)
    doctors_q = (
        db.query(Doctor, User)
        .join(User, Doctor.user_id == User.id)
        .filter(Doctor.tenant_id == tenant_id)
        .all()
    )
    return [
        DoctorReadWithName(
            user_id=d.user_id,
            first_name=u.first_name,
            last_name=u.last_name,
            specialization=d.specialization,
            education=d.education,
            licence_number=d.licence_number,
            tenant_id=d.tenant_id,
            working_hours=d.working_hours,
            is_active=d.is_active,
            created_at=d.created_at,
        )
        for d, u in doctors_q
    ]


@router.get("/departments", response_model=list[TenantDepartmentWithServicesRead])
def list_tenant_departments(
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """List current user's tenant departments (tenant_id from JWT)."""
    _, tenant_id = auth
    _assert_tenant_exists(db, tenant_id)
    return _list_tenant_departments(db, tenant_id)


@router.post("/departments", response_model=list[TenantDepartmentWithServicesRead])
def bulk_set_tenant_departments(
    payload: BulkDepartmentsRequest,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Bulk set departments for current user's tenant (tenant_id from JWT)."""
    _, tenant_id = auth
    return _bulk_set_tenant_departments(db, tenant_id, payload)


@router.get("/products", response_model=list[ProductRead])
def list_tenant_products(
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """List current user's tenant products (tenant_id from JWT)."""
    _, tenant_id = auth
    _assert_tenant_exists(db, tenant_id)
    return (
        db.query(Product)
        .filter(
            Product.tenant_id == tenant_id,
            Product.is_available == True,
        )
        .all()
    )


@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_tenant_product(
    payload: ProductCreateForTenant,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Create product for current user's tenant (tenant_id from JWT)."""
    _, tenant_id = auth
    _assert_tenant_exists(db, tenant_id)
    product = Product(
        tenant_id=tenant_id,
        name=payload.name,
        description=payload.description,
        category=(payload.category or "").strip() or None,
        image_url=(payload.image_url or "").strip() or None,
        price=payload.price,
        stock_quantity=payload.stock_quantity,
        is_available=payload.is_available,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return ProductRead.model_validate(product)


@router.put("/products/{product_id}", response_model=ProductRead)
def update_tenant_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Update product. Product must belong to current user's tenant."""
    _, tenant_id = auth
    product = (
        db.query(Product)
        .filter(
            Product.product_id == product_id,
            Product.tenant_id == tenant_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if k in {"name", "category", "image_url"} and isinstance(v, str):
            v = v.strip()
            if k in {"category", "image_url"} and not v:
                v = None
        setattr(product, k, v)
    if "price" in data:
        product.price = Decimal(str(data["price"]))
    db.commit()
    db.refresh(product)
    return ProductRead.model_validate(product)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant_product(
    product_id: int,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Delete product. Product must belong to current user's tenant."""
    _, tenant_id = auth
    product = (
        db.query(Product)
        .filter(
            Product.product_id == product_id,
            Product.tenant_id == tenant_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    db.delete(product)
    db.commit()


@router.post("/doctors", response_model=DoctorRead)
def create_tenant_doctor(
    payload: DoctorCreateForTenant,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Assign/create doctor for current user's tenant. User must have DOCTOR role."""
    _, tenant_id = auth
    _assert_tenant_exists(db, tenant_id)
    tenant_department = (
        db.query(TenantDepartment)
        .filter(TenantDepartment.tenant_id == tenant_id)
        .order_by(TenantDepartment.id.asc())
        .first()
    )
    if not tenant_department:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No tenant departments configured. Create a department before assigning doctors.",
        )
    doctor_role = db.query(Role).filter(Role.name == "DOCTOR").first()
    if not doctor_role:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="DOCTOR role not found"
        )
    user = (
        db.query(User)
        .filter(
            User.id == payload.user_id,
            User.role_id == doctor_role.id,
        )
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found or not a doctor"
        )
    existing = db.query(Doctor).filter(Doctor.user_id == payload.user_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Doctor already assigned to a tenant"
        )
    doctor = Doctor(
        user_id=payload.user_id,
        tenant_id=tenant_id,
        tenant_department_id=tenant_department.id,
        specialization=payload.specialization,
        education=payload.education,
        licence_number=payload.licence_number,
        working_hours=payload.working_hours,
        is_active=True,
    )
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return DoctorRead.model_validate(doctor)


@router.put("/doctors/{user_id}", response_model=DoctorRead)
def update_tenant_doctor(
    user_id: int,
    payload: DoctorUpdate,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Update doctor. Doctor must belong to current user's tenant."""
    _, tenant_id = auth
    doctor = (
        db.query(Doctor)
        .filter(
            Doctor.user_id == user_id,
            Doctor.tenant_id == tenant_id,
        )
        .first()
    )
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(doctor, k, v)
    db.commit()
    db.refresh(doctor)
    return DoctorRead.model_validate(doctor)


@router.delete("/doctors/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant_doctor(
    user_id: int,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Remove doctor from tenant."""
    _, tenant_id = auth
    doctor = (
        db.query(Doctor)
        .filter(
            Doctor.user_id == user_id,
            Doctor.tenant_id == tenant_id,
        )
        .first()
    )
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    db.delete(doctor)
    db.commit()


@router.delete("/departments/{tenant_department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant_department(
    tenant_department_id: int,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Delete a tenant department (and its services). Must belong to current user's tenant."""
    _, tenant_id = auth
    td = (
        db.query(TenantDepartment)
        .filter(
            TenantDepartment.id == tenant_department_id,
            TenantDepartment.tenant_id == tenant_id,
        )
        .first()
    )
    if not td:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant department not found"
        )
    db.delete(td)
    db.commit()


@router.get("/services", response_model=list[ServiceRead])
def list_tenant_services(
    tenant_department_id: int | None = Query(
        default=None, description="Filter by tenant department"
    ),
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """List services for current user's tenant. Optional tenant_department_id to filter by department."""
    _, tenant_id = auth
    q = db.query(Service).filter(Service.tenant_id == tenant_id, Service.is_active == True)
    if tenant_department_id is not None:
        q = q.filter(Service.tenant_departments_id == tenant_department_id)
    services = q.order_by(Service.name).all()
    return [ServiceRead.model_validate(s) for s in services]


@router.get("/services/{service_id}", response_model=ServiceRead)
def get_tenant_service(
    service_id: int,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Get single service. Service must belong to current user's tenant."""
    _, tenant_id = auth
    service = (
        db.query(Service)
        .filter(
            Service.id == service_id,
            Service.tenant_id == tenant_id,
        )
        .first()
    )
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    return ServiceRead.model_validate(service)


@router.post("/services", response_model=ServiceRead)
def create_tenant_service(
    payload: ServiceCreateInput,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Create service under a tenant department. Department must belong to current user's tenant."""
    _, tenant_id = auth
    td = (
        db.query(TenantDepartment)
        .filter(
            TenantDepartment.id == payload.tenant_department_id,
            TenantDepartment.tenant_id == tenant_id,
        )
        .first()
    )
    if not td:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant department not found"
        )
    existing = (
        db.query(Service)
        .filter(
            Service.tenant_departments_id == payload.tenant_department_id,
            Service.name == payload.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Service with this name already exists for this department",
        )
    service = Service(
        name=payload.name,
        price=Decimal(str(payload.price)),
        description=payload.description,
        tenant_departments_id=payload.tenant_department_id,
        tenant_id=tenant_id,
        is_active=True,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return ServiceRead.model_validate(service)


@router.put("/services/{service_id}", response_model=ServiceRead)
def update_tenant_service(
    service_id: int,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Update service. Service must belong to current user's tenant."""
    _, tenant_id = auth
    service = (
        db.query(Service)
        .filter(
            Service.id == service_id,
            Service.tenant_id == tenant_id,
        )
        .first()
    )
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(service, k, v)
    if "price" in data:
        service.price = Decimal(str(data["price"]))
    db.commit()
    db.refresh(service)
    return ServiceRead.model_validate(service)


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant_service(
    service_id: int,
    db: Session = Depends(get_db),
    auth: tuple = Depends(require_tenant_from_token),
):
    """Delete service. Service must belong to current user's tenant."""
    _, tenant_id = auth
    service = (
        db.query(Service)
        .filter(
            Service.id == service_id,
            Service.tenant_id == tenant_id,
        )
        .first()
    )
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    db.delete(service)
    db.commit()
