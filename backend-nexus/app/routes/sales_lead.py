"""
Routes for lead management (public lead creation + sales agent operations).
"""

from fastapi import APIRouter, Depends, status, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from datetime import datetime

from app.db import get_db
from app.models import LeadStatus, ConsultationBooking, ConsultationStatus, LeadStatusHistory
from app.schemas.lead import (
    LeadCreate, LeadCreateResponse, LeadListResponse, LeadRead, FollowUpUpdate, LeadTransition, LeadStatusPublic,
    LeadStatusHistoryListResponse, ConsultationCreate, ConsultationRead, ConsultationListResponse
)
from app.services.lead_service import create_lead, transition_lead, ActorContext, LeadServiceError
from app.repositories import list_unclaimed_leads, list_my_leads, get_lead_by_id
from app.auth.auth_utils import require_permission

router = APIRouter(prefix="/leads", tags=["Leads"])


# ===== Public Endpoints =====

@router.post("", response_model=LeadCreateResponse, status_code=status.HTTP_201_CREATED)
def post_create_lead(
    payload: LeadCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new lead from public consultation form. No authentication required.
    """
    lead = create_lead(payload, db)
    return lead


@router.get("/{lead_id}/status", response_model=LeadStatusPublic)
def get_lead_status(
    lead_id: int,
    contact_email: str = Query(..., description="Email to verify ownership (must match lead contact email)"),
    db: Session = Depends(get_db),
):
    """
    Public endpoint to track lead status by Request ID + email verification. No authentication required.
    """
    # Fetch the lead
    lead = get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Request ID not found")
    
    # Verify email matches (security: prevent unauthorized access)
    if lead.contact_email.lower() != contact_email.lower():
        raise HTTPException(status_code=403, detail="Email verification failed")
    
    return LeadStatusPublic(
        request_id=lead.id,
        status=lead.status,
        contact_email=lead.contact_email,
        organization_name=lead.organization_name,
        created_at=lead.created_at,
    )


@router.get("", response_model=LeadListResponse)
def get_leads(
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Results per page"),
    status: Optional[LeadStatus] = Query(default=None, description="Filter by status"),
    source: Optional[str] = Query(default=None, description="Filter by source"),
    search: Optional[str] = Query(default=None, description="Search across organization_name, contact_name, contact_email, licence_number"),
    sort: str = Query(default="created_at", description="Sort by field (use -field for DESC)"),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    List unclaimed leads. Supports filtering, search, pagination, and sorting. Requires SALES role.
    """
    # Calculate offset for pagination
    offset = (page - 1) * page_size
    
    # Get leads from repository
    leads, total = list_unclaimed_leads(
        db=db,
        status=status,
        source=source,
        search=search,
        sort=sort,
        limit=page_size,
        offset=offset,
    )
    
    return LeadListResponse(
        items=leads,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/my-leads", response_model=LeadListResponse)
def get_my_leads(
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Results per page"),
    status: Optional[LeadStatus] = Query(default=None, description="Filter by status"),
    source: Optional[str] = Query(default=None, description="Filter by source"),
    search: Optional[str] = Query(default=None, description="Search across organization_name, contact_name, contact_email, licence_number"),
    sort: str = Query(default="created_at", description="Sort by field (use -field for DESC)"),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    List leads assigned to current user. Supports filtering, search, pagination, and sorting. Requires SALES role.
    """
    # Extract current user's ID from JWT token
    user_id = user.get("user_id")
    if user_id is None:
        raise ValueError("user_id not found in JWT token")
    
    # Calculate offset for pagination
    offset = (page - 1) * page_size
    
    # Get leads assigned to this user from repository
    leads, total = list_my_leads(
        db=db,
        user_id=user_id,
        status=status,
        source=source,
        search=search,
        sort=sort,
        limit=page_size,
        offset=offset,
    )
    
    return LeadListResponse(
        items=leads,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{lead_id}", response_model=LeadRead)
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    Get lead details by ID. Returns null values for unclaimed leads. Requires SALES role.
    """
    lead = get_lead_by_id(db, lead_id)
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return lead


@router.post("/{lead_id}/owner", response_model=LeadRead)
def update_lead_ownership(
    lead_id: int,
    action: str = Query(..., description="Action: 'claim' or 'release'"),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    Manage lead ownership. claim: assign to current user. release: remove ownership.
    """
    # Fetch the lead
    lead = get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    current_user_id = user.get("user_id")
    
    if current_user_id is None:
        raise ValueError("user_id not found in JWT token")
    
    # Validate action
    if action not in ["claim", "release"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid action. Must be 'claim' or 'release'"
        )
    
    # CLAIM: Assign lead to current user
    if action == "claim":
        if lead.assigned_sales_user_id is not None and lead.assigned_sales_user_id != current_user_id:
            raise HTTPException(
                status_code=403,
                detail="Lead is already claimed by another agent"
            )
        lead.assigned_sales_user_id = current_user_id
    
    # RELEASE: Remove ownership (current user only)
    elif action == "release":
        # Terminal leads cannot be released
        if lead.status in [LeadStatus.CONVERTED, LeadStatus.REJECTED, LeadStatus.LOST]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot release terminal leads (status: {lead.status})"
            )
        if lead.assigned_sales_user_id != current_user_id:
            raise HTTPException(
                status_code=403,
                detail="You can only release leads you own"
            )
        lead.assigned_sales_user_id = None
    
    # Commit changes
    db.commit()
    db.refresh(lead)
    
    return lead


@router.patch("/{lead_id}/follow-up", response_model=LeadRead)
def update_lead_followup(
    lead_id: int,
    payload: FollowUpUpdate,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    Update lead follow-up actions. Only the lead owner can update.
    """
    # Fetch the lead
    lead = get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    current_user_id = user.get("user_id")
    
    if current_user_id is None:
        raise ValueError("user_id not found in JWT token")
    
    # Check ownership: only the assigned agent can update follow-up
    if lead.assigned_sales_user_id != current_user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only update follow-up for leads you own"
        )
    
    # Update follow-up fields (both optional, can update either or both)
    if payload.next_action is not None:
        lead.next_action = payload.next_action
    if payload.next_action_due_at is not None:
        lead.next_action_due_at = payload.next_action_due_at
    
    # Commit changes
    db.commit()
    db.refresh(lead)
    
    return lead


@router.post("/{lead_id}/transition", response_model=LeadRead)
def transition_lead_status(
    lead_id: int,
    payload: LeadTransition,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    Transition lead status in the sales pipeline. Only the lead owner can transition.
    """
    current_user_id = user.get("user_id")
    current_role = user.get("role", "").lower()
    
    if current_user_id is None:
        raise ValueError("user_id not found in JWT token")
    
    # Create actor context for the service
    actor = ActorContext(user_id=current_user_id, role=current_role)
    
    try:
        # Call service to perform transition
        lead = transition_lead(
            lead_id=lead_id,
            new_status=payload.new_status,
            actor=actor,
            session=db,
            reason=payload.reason,
        )
        return lead
    
    except LeadServiceError as e:
        raise HTTPException(status_code=e.http_status, detail=e.message)


@router.get("/{lead_id}/history", response_model=LeadStatusHistoryListResponse)
def get_lead_status_history(
    lead_id: int,
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Results per page"),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    Get status transition history for a lead. Returns paginated records sorted by most recent first.
    Only the lead owner can view the history. Requires SALES role.
    """
    current_user_id = user.get("user_id")
    
    if current_user_id is None:
        raise ValueError("user_id not found in JWT token")
    
    # Verify lead exists
    lead = get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check ownership: only the assigned agent can view history
    if lead.assigned_sales_user_id != current_user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only view history for leads you own"
        )
    
    # Calculate offset
    offset = (page - 1) * page_size
    
    # Query history records (most recent first)
    history_query = db.query(LeadStatusHistory).filter(
        LeadStatusHistory.lead_id == lead_id
    ).order_by(LeadStatusHistory.changed_at.desc())
    
    # Get total count
    total = history_query.count()
    
    # Get paginated results
    history_items = history_query.limit(page_size).offset(offset).all()
    
    return LeadStatusHistoryListResponse(
        items=history_items,
        total=total,
        page=page,
        page_size=page_size,
    )


# ===== Lead-Scoped Consultation Endpoints =====

@router.post("/{lead_id}/consultations", response_model=ConsultationRead, status_code=status.HTTP_201_CREATED)
def create_consultation_for_lead(
    lead_id: int,
    payload: ConsultationCreate,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    Create a consultation booking for a lead. Only the lead owner can create.
    Automatically sets status = SCHEDULED.
    """
    current_user_id = user.get("user_id")
    
    if current_user_id is None:
        raise ValueError("user_id not found in JWT token")
    
    # Verify lead exists and user owns it
    lead = get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.assigned_sales_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Only the lead owner can create consultations")
    
    # Create consultation
    consultation = ConsultationBooking(
        lead_id=lead_id,
        scheduled_at=payload.scheduled_at,
        duration_minutes=payload.duration_minutes,
        meeting_link=payload.meeting_link,
        location=payload.location,
        status=ConsultationStatus.SCHEDULED,
        created_by_user_id=current_user_id,
    )
    
    db.add(consultation)
    db.commit()
    db.refresh(consultation)
    
    return consultation


@router.get("/{lead_id}/consultations", response_model=ConsultationListResponse)
def list_consultations_for_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: ConsultationStatus | None = Query(None),
):
    """
    List all consultations for a lead.
    Optionally filter by status (SCHEDULED, COMPLETED, CANCELLED, NO_SHOW).
    """
    current_user_id = user.get("user_id")
    
    # Verify lead exists and user owns it
    lead = get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.assigned_sales_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Only the lead owner can view consultations")
    
    base_query = db.query(ConsultationBooking).filter(ConsultationBooking.lead_id == lead_id)
    if status is not None:
        base_query = base_query.filter(ConsultationBooking.status == status)

    total = base_query.count()
    consultations = (
        base_query
        .order_by(ConsultationBooking.scheduled_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    
    return ConsultationListResponse(
        items=consultations,
        total=total,
        page=page,
        page_size=page_size,
    )
