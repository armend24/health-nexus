from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.tenant_audit_log import TenantAuditLog
from app.schemas.tenant_audit_log import TenantAuditLogRead, AuditLogListResponse
from app.auth.auth_utils import get_current_user

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_super_admin(current_user: dict):
    if current_user.get("role") != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can access all audit logs")


def verify_audit_access(current_user: dict, tenant_id: int):
    role = current_user.get("role")
    user_tenant_id = current_user.get("tenant_id")

    if role not in ["SUPER_ADMIN", "TENANT_MANAGER"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    if role == "TENANT_MANAGER" and user_tenant_id != tenant_id:
        raise HTTPException(
            status_code=403, detail="Tenant managers can only access their own tenant logs"
        )


# get all tenant audit logs - accessible only by SUPER_ADMIN
@router.get("", response_model=AuditLogListResponse)
def get_all_audit_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_super_admin(current_user)

    query = db.query(TenantAuditLog).order_by(TenantAuditLog.created_at.desc())

    total = query.count()

    offset = (page - 1) * page_size

    logs = query.offset(offset).limit(page_size).all()

    return AuditLogListResponse(
        items=logs,
        total=total,
        page=page,
        page_size=page_size,
    )


# get tenant audit logs for specific tenant - accessible by SUPER_ADMIN and TENANT_MANAGER of that tenant
@router.get("/{tenant_id}", response_model=AuditLogListResponse)
def get_tenant_audit_logs(
    tenant_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_audit_access(current_user, tenant_id)

    query = (
        db.query(TenantAuditLog)
        .filter(TenantAuditLog.tenant_id == tenant_id)
        .order_by(TenantAuditLog.created_at.desc())
    )

    total = query.count()

    offset = (page - 1) * page_size

    logs = query.offset(offset).limit(page_size).all()

    return AuditLogListResponse(
        items=logs,
        total=total,
        page=page,
        page_size=page_size,
    )
