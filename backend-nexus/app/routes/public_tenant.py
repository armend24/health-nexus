import secrets

from fastapi import APIRouter, Depends, status, HTTPException, Request, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.db import get_db as app_get_db
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User
from app.models.patient import Patient
from app.models.lead import Lead, LeadStatus
from app.schemas.tenant import TenantCreate, TenantRead
from app.schemas.lead import (
    LeadCreate,
    PublicLeadCreate,
    PublicLeadTrackingRead,
    PublicLeadTrackingStep,
)
from app.schemas.patient import ClientRegistrationRequest, ClientRegistrationResponse
from app.auth.auth_utils import hash_password, verify_token, TokenError

router = APIRouter(prefix="/tenants", tags=["Public Tenant Requests"])

_TENANT_NOT_ACTIVE_DETAIL = {
    "code": "TENANT_NOT_ACTIVE",
    "message": "Tenant must be active to register clients",
}


def _build_public_tracking_roadmap(current_status: str) -> list[PublicLeadTrackingStep]:
    """
    Build a UI-ready roadmap for the public tracking page.

    We support both legacy backend statuses and PRD-08 statuses so the response
    remains compatible while the sales pipeline is being aligned.
    """

    status = (current_status or "").upper()
    if status in {"QUALIFIED", "CONSULTATION_SCHEDULED", "CONSULTATION_COMPLETED", "AWAITING_DECISION", "LOST"}:
        flow = [
            "NEW",
            "QUALIFIED",
            "CONTACTED",
            "CONSULTATION_SCHEDULED",
            "CONSULTATION_COMPLETED",
            "AWAITING_DECISION",
            "CONVERTED",
        ]
    else:
        flow = [
            "NEW",
            "CONTACTED",
            "DEMO_SCHEDULED",
            "DEMO_COMPLETED",
            "HIGH_INTEREST",
            "NEGOTIATION",
            "CONVERTED",
        ]

    if status in {"REJECTED", "LOST"}:
        # Terminal non-converted statuses show all regular flow steps as not started.
        return [
            PublicLeadTrackingStep(
                status=step,
                state="NOT_STARTED" if step != flow[0] else "DONE",
            )
            for step in flow
        ] + [PublicLeadTrackingStep(status=status, state="IN_PROGRESS")]

    try:
        idx = flow.index(status)
    except ValueError:
        idx = 0

    roadmap: list[PublicLeadTrackingStep] = []
    for step_idx, step in enumerate(flow):
        if step_idx < idx:
            state = "DONE"
        elif step_idx == idx:
            state = "IN_PROGRESS"
        else:
            state = "NOT_STARTED"
        roadmap.append(PublicLeadTrackingStep(status=step, state=state))

    return roadmap


def get_db():
    yield from app_get_db()


def get_authenticated_user_if_present(request: Request) -> dict | None:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None

    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        return verify_token(token)
    except TokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# Endpoint for potential tenants to apply for a tenant account (Tenant Application).
@router.post("", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
def create_tenant_application(payload: TenantCreate, db: Session = Depends(get_db)):

    # If the email/licence_number already exists in the database, tenant creation is not allowed.
    existing = (
        db.query(Tenant)
        .filter((Tenant.email == payload.email) | (Tenant.licence_number == payload.licence_number))
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=409, detail="Tenant with this email or licence number already exists"
        )

    tenant = Tenant(
        name=payload.name,
        email=payload.email,
        licence_number=payload.licence_number,
        status=TenantStatus.pending,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


# Endpoint for potential tenants to submit a consultation request
# (e.g: to get more info about what Nexus Health offers, ask for a demo etc), without applying to join the platform first.
@router.post(
    "/consultation",
    status_code=status.HTTP_201_CREATED,
)
def create_public_lead(
    payload: PublicLeadCreate,
    db: Session = Depends(get_db),
):

    lead = Lead(
        organization_name=payload.tenant_name,
        contact_email=payload.contact_email,
        source="WEBSITE",
        status=LeadStatus.NEW,
        initial_message=payload.description,
    )

    db.add(lead)
    db.commit()
    db.refresh(lead)

    return lead


@router.get(
    "/consultation/track",
    response_model=PublicLeadTrackingRead,
    status_code=status.HTTP_200_OK,
)
def track_public_lead_status(
    lead_id: int = Query(..., ge=1),
    email: str = Query(..., min_length=3),
    db: Session = Depends(get_db),
):
    """
    Public tracking endpoint for consultation requests.

    Access model:
    - caller provides lead_id + contact email
    - endpoint returns only minimal status data needed by roadmap UI
    """
    normalized_email = email.strip().lower()
    lead = (
        db.query(Lead)
        .filter(
            Lead.id == lead_id,
            Lead.contact_email.isnot(None),
            Lead.contact_email.ilike(normalized_email),
        )
        .first()
    )
    if not lead:
        raise HTTPException(
            status_code=404,
            detail="Lead tracking record not found for provided credentials",
        )

    current_status = (
        lead.status.value if isinstance(lead.status, LeadStatus) else str(lead.status)
    )
    roadmap = _build_public_tracking_roadmap(current_status)

    return PublicLeadTrackingRead(
        lead_id=lead.id,
        organization_name=lead.organization_name,
        contact_email=lead.contact_email,
        current_status=current_status,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
        roadmap=roadmap,
    )


@router.post(
    "/{tenant_id}/clients/register",
    response_model=ClientRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_client_in_tenant(
    tenant_id: int,
    payload: ClientRegistrationRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.status != TenantStatus.approved:
        raise HTTPException(status_code=403, detail=_TENANT_NOT_ACTIVE_DETAIL)

    authenticated_user = get_authenticated_user_if_present(request)
    if authenticated_user is not None:
        role = str(authenticated_user.get("role") or "").strip().upper()
        authenticated_email = str(authenticated_user.get("email") or "").strip().lower()
        payload_email = (payload.email or "").strip().lower()
        user_tenant_id = authenticated_user.get("tenant_id")
        # CLIENT users can register themselves under multiple approved tenants.
        # Tenant-scoped staff should still be limited to their own tenant.
        if role in {"CLIENT", "PATIENT"} and authenticated_email and payload_email != authenticated_email:
            raise HTTPException(status_code=403, detail="Email does not match authenticated user")
        if role not in {"", "CLIENT", "PATIENT", "SUPER_ADMIN"} and user_tenant_id is not None:
            try:
                if int(user_tenant_id) != tenant_id:
                    raise HTTPException(status_code=403, detail="Tenant access denied")
            except (ValueError, TypeError):
                raise HTTPException(status_code=403, detail="Tenant access denied")

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        generated_password = payload.password or secrets.token_urlsafe(24)
        user = User(
            email=payload.email,
            password=hash_password(generated_password),
            first_name=payload.first_name,
            last_name=payload.last_name,
        )
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            user = db.query(User).filter(User.email == payload.email).first()
            if not user:
                raise

    existing_patient = (
        db.query(Patient)
        .filter(
            Patient.user_id == user.id,
            Patient.tenant_id == tenant.id,
        )
        .first()
    )
    if existing_patient:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "EMAIL_ALREADY_REGISTERED",
                "message": "Email already registered in this tenant",
            },
        )

    patient = Patient(
        user_id=user.id,
        tenant_id=tenant.id,
        birthdate=payload.birthdate,
        gender=payload.gender,
        blood_type=payload.blood_type,
    )
    db.add(patient)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        duplicate = (
            db.query(Patient)
            .filter(
                Patient.user_id == user.id,
                Patient.tenant_id == tenant.id,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "EMAIL_ALREADY_REGISTERED",
                    "message": "Email already registered in this tenant",
                },
            )
        raise

    return ClientRegistrationResponse(
        user_id=user.id,
        patient_id=user.id,
        tenant_id=tenant.id,
    )


# Add an endpoint that gets plans. (IGNORE because it is a scrapped for now)
