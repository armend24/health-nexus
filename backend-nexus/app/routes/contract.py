"""Contract CRUD, status transition, and signature endpoints."""

from datetime import datetime, timezone

import base64

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session, joinedload

from app.auth.auth_utils import get_current_user, normalize_role
from app.db import get_db
from app.models.contract import Contract, ContractStatus
from app.models.doctor import Doctor
from app.models.tenant_manager import TenantManager
from app.schemas.contract import (
    ContractCreate,
    ContractRead,
    ContractTransition,
    ContractUpdate,
)
from app.lib.html_sanitize import sanitize_html
from app.lib.storage import get_stored_file, save_signature
from app.services.audit_service import create_audit_log
from app.services.contract_service import transition_contract
from app.models.tenant_audit_log import TenantAuditEventType

router = APIRouter(prefix="/api", tags=["Contracts"])

ALLOWED_SIGNATURE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
MAX_SIGNATURE_SIZE_BYTES = 2 * 1024 * 1024  # 2MB


def _require_contract_access(user: dict, tenant_id: int, db: Session) -> None:
    """Allow super_admin for any tenant, tenant_manager only for their tenant."""
    role = normalize_role(user.get("role"))
    if role in {"admin", "super_admin"}:
        return
    if role == "tenant_manager":
        user_id = user.get("user_id")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized",
            )
        manager = (
            db.query(TenantManager)
            .filter(
                TenantManager.user_id == user_id,
                TenantManager.tenant_id == tenant_id,
            )
            .first()
        )
        if not manager:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized as tenant manager for this tenant",
            )
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Insufficient permissions",
    )


def _get_contract_or_404(db: Session, contract_id: int, with_relations: bool = False) -> Contract:
    q = db.query(Contract).filter(Contract.id == contract_id)
    if with_relations:
        q = q.options(
            joinedload(Contract.tenant),
            joinedload(Contract.doctor).joinedload(Doctor.user),
        )
    contract = q.first()
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contract not found",
        )
    return contract


def _contract_to_read(contract: Contract) -> ContractRead:
    """Build ContractRead with tenant_name and doctor_name from relations."""
    base = ContractRead.model_validate(contract)
    tenant_name = contract.tenant.name if contract.tenant else None
    doctor_name = None
    if contract.doctor and contract.doctor.user:
        u = contract.doctor.user
        parts = [u.first_name or "", u.last_name or ""]
        doctor_name = " ".join(parts).strip() or None
    return base.model_copy(update={"tenant_name": tenant_name, "doctor_name": doctor_name})


def _require_contract_view_access(user: dict, contract: Contract, db: Session) -> None:
    """Allow tenant manager, super_admin, or the assigned doctor to view contract/signatures."""
    role = normalize_role(user.get("role"))
    if role in {"admin", "super_admin"}:
        return
    if role == "tenant_manager":
        _require_contract_access(user, contract.tenant_id, db)
        return
    if role == "doctor" and contract.doctor_user_id == user.get("user_id"):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


# GET /tenants/{tenant_id}/contracts
@router.get("/tenants/{tenant_id}/contracts", response_model=list[ContractRead])
def list_contracts(
    tenant_id: int,
    doctor_user_id: int | None = Query(default=None, description="Filter by doctor user_id"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List contracts for a tenant. Optionally filter by doctor. Tenant manager: own tenant only. Super admin: any."""
    _require_contract_access(user, tenant_id, db)
    q = (
        db.query(Contract)
        .filter(Contract.tenant_id == tenant_id)
        .options(
            joinedload(Contract.tenant),
            joinedload(Contract.doctor).joinedload(Doctor.user),
        )
    )
    if doctor_user_id is not None:
        q = q.filter(Contract.doctor_user_id == doctor_user_id)
    contracts = q.order_by(Contract.id.desc()).all()
    return [_contract_to_read(c) for c in contracts]


# POST /tenants/{tenant_id}/contracts
@router.post(
    "/tenants/{tenant_id}/contracts",
    response_model=ContractRead,
    status_code=status.HTTP_201_CREATED,
)
def create_contract(
    tenant_id: int,
    payload: ContractCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create contract for a doctor (default DRAFT). Tenant manager: own tenant only. Super admin: any."""
    _require_contract_access(user, tenant_id, db)

    # Ensure doctor exists and belongs to tenant
    if payload.doctor_user_id:
        doctor = (
            db.query(Doctor)
            .filter(
                Doctor.user_id == payload.doctor_user_id,
                Doctor.tenant_id == tenant_id,
            )
            .first()
        )
        if not doctor:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Doctor not found or does not belong to this tenant",
            )

    contract = Contract(
        tenant_id=tenant_id,
        doctor_user_id=payload.doctor_user_id,
        status=ContractStatus.DRAFT,
        salary=payload.salary,
        terms_content=sanitize_html(payload.terms_content) if payload.terms_content else None,
        terms_metadata=payload.terms_metadata,
        start_date=payload.start_date,
        end_date=payload.end_date,
        activated_at=payload.activated_at,
        expires_at=payload.expires_at,
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)
    c = _get_contract_or_404(db, contract.id, with_relations=True)
    return _contract_to_read(c)


# GET /contracts/{contract_id}
@router.get("/contracts/{contract_id}", response_model=ContractRead)
def get_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get contract by id. Tenant manager: own tenant only. Super admin: any. Doctor: own contract only."""
    contract = _get_contract_or_404(db, contract_id, with_relations=True)
    _require_contract_view_access(user, contract, db)
    return _contract_to_read(contract)


# PATCH /contracts/{contract_id}
@router.patch("/contracts/{contract_id}", response_model=ContractRead)
def update_contract(
    contract_id: int,
    payload: ContractUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Edit dates, salary, terms. Status changes go through transition endpoint."""
    contract = _get_contract_or_404(db, contract_id)
    _require_contract_access(user, contract.tenant_id, db)

    if payload.doctor_user_id is not None:
        doctor = (
            db.query(Doctor)
            .filter(
                Doctor.user_id == payload.doctor_user_id,
                Doctor.tenant_id == contract.tenant_id,
            )
            .first()
        )
        if not doctor:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Doctor not found or does not belong to this tenant",
            )

    update_data = payload.model_dump(exclude_unset=True)
    if "terms_content" in update_data:
        update_data["terms_content"] = sanitize_html(update_data["terms_content"])
    for k, v in update_data.items():
        setattr(contract, k, v)

    db.commit()
    db.refresh(contract)
    c = _get_contract_or_404(db, contract.id, with_relations=True)
    return _contract_to_read(c)


# POST /contracts/{contract_id}/transition
@router.post("/contracts/{contract_id}/transition", response_model=ContractRead)
def transition_contract_status(
    contract_id: int,
    payload: ContractTransition,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Transition contract status (tenant manager). Validates allowed transitions, dates, and terminate reason."""
    contract = _get_contract_or_404(db, contract_id)
    _require_contract_access(user, contract.tenant_id, db)

    try:
        next_status = ContractStatus(payload.next_status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status: {payload.next_status}",
        )

    old_status = contract.status
    try:
        transition_contract(db, contract, next_status, reason=payload.reason)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    user_id = user.get("user_id")
    role = user.get("role")
    role_str = getattr(role, "name", role) if role else None

    create_audit_log(
        db=db,
        tenant_id=contract.tenant_id,
        event_type=TenantAuditEventType.STATUS_CHANGE,
        entity_name="contract",
        entity_id=contract.id,
        old_value={"status": old_status.value},
        new_value={"status": next_status.value},
        performed_by_user_id=user_id,
        performed_by_role=role_str,
        reason=payload.reason if next_status == ContractStatus.TERMINATED else None,
    )

    db.commit()
    db.refresh(contract)
    c = _get_contract_or_404(db, contract.id, with_relations=True)
    return _contract_to_read(c)


# POST /contracts/{contract_id}/sign/doctor
@router.post("/contracts/{contract_id}/sign/doctor", response_model=ContractRead)
async def sign_contract_doctor(
    contract_id: int,
    signature: UploadFile = File(..., description="Signature image (PNG, JPEG, WebP; max 2MB)"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Doctor signs the contract digitally. Upload a signature image."""
    contract = _get_contract_or_404(db, contract_id)
    if contract.doctor_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contract has no doctor assigned",
        )
    caller_id = user.get("user_id")
    if caller_id != contract.doctor_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned doctor can sign this contract",
        )
    if contract.doctor_signed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contract already signed by doctor",
        )

    content = await signature.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty signature image")
    if len(content) > MAX_SIGNATURE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Signature image must be under 2MB")
    ct = (signature.content_type or "").split(";")[0].strip()
    if ct and ct not in ALLOWED_SIGNATURE_TYPES:
        raise HTTPException(status_code=400, detail="Signature must be PNG, JPEG, or WebP")
    contract.doctor_signature = save_signature(contract_id, "doctor", content, ct)

    contract.doctor_signed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(contract)
    c = _get_contract_or_404(db, contract.id, with_relations=True)
    return _contract_to_read(c)


# POST /contracts/{contract_id}/sign/hospital
@router.post("/contracts/{contract_id}/sign/hospital", response_model=ContractRead)
async def sign_contract_hospital(
    contract_id: int,
    signature: UploadFile = File(..., description="Signature image (PNG, JPEG, WebP; max 2MB)"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Hospital/tenant manager signs the contract digitally. Upload a signature image."""
    contract = _get_contract_or_404(db, contract_id)
    _require_contract_access(user, contract.tenant_id, db)

    if contract.hospital_signed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contract already signed by hospital",
        )

    content = await signature.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty signature image")
    if len(content) > MAX_SIGNATURE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Signature image must be under 2MB")
    ct = (signature.content_type or "").split(";")[0].strip()
    if ct and ct not in ALLOWED_SIGNATURE_TYPES:
        raise HTTPException(status_code=400, detail="Signature must be PNG, JPEG, or WebP")
    contract.hospital_signature = save_signature(contract_id, "hospital", content, ct)

    contract.hospital_signed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(contract)
    c = _get_contract_or_404(db, contract.id, with_relations=True)
    return _contract_to_read(c)


_EXT_TO_MEDIA = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def _serve_signature(contract: Contract, role: str) -> Response:
    """Serve signature image from storage path or legacy base64."""
    value = contract.doctor_signature if role == "doctor" else contract.hospital_signature
    if not value:
        raise HTTPException(status_code=404, detail="Signature not found")
    if value.startswith("data:"):
        # Legacy base64: parse data:image/png;base64,<data>
        parts = value.split(",", 1)
        if len(parts) != 2:
            raise HTTPException(status_code=404, detail="Invalid signature format")
        try:
            raw = base64.b64decode(parts[1])
        except Exception:
            raise HTTPException(status_code=404, detail="Invalid signature format")
        media = "image/png"
        if "image/" in parts[0]:
            media = parts[0].split(";")[0].replace("data:", "").strip() or "image/png"
        return Response(content=raw, media_type=media)
    file_path = get_stored_file(value)
    if not file_path:
        raise HTTPException(status_code=404, detail="Signature file not found")
    media_type = _EXT_TO_MEDIA.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(file_path, media_type=media_type)


# GET /contracts/{contract_id}/signature/doctor
@router.get("/contracts/{contract_id}/signature/doctor", response_class=Response)
def get_doctor_signature(
    contract_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Serve doctor signature image. Auth required (tenant manager, admin, or assigned doctor)."""
    contract = _get_contract_or_404(db, contract_id)
    _require_contract_view_access(user, contract, db)
    return _serve_signature(contract, "doctor")


# GET /contracts/{contract_id}/signature/hospital
@router.get("/contracts/{contract_id}/signature/hospital", response_class=Response)
def get_hospital_signature(
    contract_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Serve hospital signature image. Auth required (tenant manager, admin, or assigned doctor)."""
    contract = _get_contract_or_404(db, contract_id)
    _require_contract_view_access(user, contract, db)
    return _serve_signature(contract, "hospital")
