"""Services - CRUD for services (optionally filtered by tenant/department)."""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user, normalize_role
from app.db import get_db
from app.models.service import Service
from app.models.tenant_department import TenantDepartment

from app.schemas.landing import ServiceLandingItem
from app.schemas.service import ServiceCreateInput, ServiceRead, ServiceUpdate

router = APIRouter(prefix="/services", tags=["Services"])


def _require_service_manager_or_admin(user: dict) -> tuple[bool, int | None]:
    """Return (is_super_admin, tenant_id_if_manager)."""
    role = normalize_role(user.get("role"))
    if role in {"admin", "super_admin"}:
        return True, None
    if role == "tenant_manager":
        tenant_id_raw = user.get("tenant_id")
        if tenant_id_raw is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
            )
        try:
            tenant_id = int(tenant_id_raw) if not isinstance(tenant_id_raw, int) else tenant_id_raw
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
            )
        return False, tenant_id
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


@router.get("", response_model=list[ServiceLandingItem])
def list_services(
    tenant_id: int | None = Query(default=None, description="Filter by tenant"),
    tenant_department_id: int | None = Query(
        default=None, description="Filter by tenant department"
    ),
    db: Session = Depends(get_db),
):
    """List services. Optionally filter by tenant_id and/or tenant_department_id."""
    q = db.query(Service).filter(Service.is_active == True)
    if tenant_id is not None:
        q = q.filter(Service.tenant_id == tenant_id)
    if tenant_department_id is not None:
        q = q.filter(Service.tenant_departments_id == tenant_department_id)
    services = q.order_by(Service.name).all()
    return [ServiceLandingItem.model_validate(s) for s in services]


@router.post("", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceCreateInput,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a service under a tenant department."""
    is_super_admin, tenant_id = _require_service_manager_or_admin(user)
    td = (
        db.query(TenantDepartment)
        .filter(TenantDepartment.id == payload.tenant_department_id)
        .first()
    )
    if not td:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant department not found"
        )
    if not is_super_admin and td.tenant_id != tenant_id:
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
        tenant_id=td.tenant_id,
        is_active=True,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.put("/{service_id}", response_model=ServiceRead)
def update_service(
    service_id: int,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update a service."""
    is_super_admin, tenant_id = _require_service_manager_or_admin(user)
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    if not is_super_admin and service.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(service, k, v)
    if "price" in data:
        service.price = Decimal(str(data["price"]))
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Delete a service (hard delete)."""
    is_super_admin, tenant_id = _require_service_manager_or_admin(user)
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    if not is_super_admin and service.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    db.delete(service)
    db.commit()
