"""
Routes for consultation booking operations (consultation-scoped endpoints).
"""

from fastapi import APIRouter, Depends, status, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

from app.db import get_db
from app.models import ConsultationBooking, ConsultationStatus, CancelledByActor
from app.schemas.lead import ConsultationRead, ConsultationListResponse
from app.repositories import get_lead_by_id
from app.auth.auth_utils import require_permission

router = APIRouter(prefix="/consultations", tags=["Consultations"])


@router.get("/my-consultations", response_model=ConsultationListResponse)
def list_my_consultations(
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
    status_filter: Optional[ConsultationStatus] = Query(None, description="Filter by consultation status (SCHEDULED, COMPLETED, CANCELLED, NO_SHOW)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """
    List consultations created by the current sales user.
    Optionally filtered by status.
    """
    current_user_id = user.get("user_id")
    
    query = db.query(ConsultationBooking).filter(
        ConsultationBooking.created_by_user_id == current_user_id
    )
    
    if status_filter:
        query = query.filter(ConsultationBooking.status == status_filter)
    
    total = query.count()
    consultations = (
        query
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


@router.get("/{consultation_id}", response_model=ConsultationRead)
def get_consultation(
    consultation_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    Get a specific consultation booking. Only accessible to the lead owner.
    """
    current_user_id = user.get("user_id")
    
    consultation = db.query(ConsultationBooking).filter(
        ConsultationBooking.id == consultation_id
    ).first()
    
    if not consultation:
        raise HTTPException(status_code=404, detail="Consultation not found")
    
    # Verify user owns the lead
    lead = get_lead_by_id(db, consultation.lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.assigned_sales_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Only the lead owner can view this consultation")
    
    return consultation


class ConsultationTransition(BaseModel):
    """Request schema for transitioning consultation status."""
    new_status: ConsultationStatus = Field(..., description="New status (COMPLETED, CANCELLED, NO_SHOW)")
    cancellation_reason: Optional[str] = Field(None, description="Reason for cancellation/no-show (optional)")
    cancelled_by_actor: Optional[CancelledByActor] = Field(None, description="Who initiated the cancellation: LEAD or SALES (optional)")


@router.post("/{consultation_id}/transition", response_model=ConsultationRead)
def transition_consultation_status(
    consultation_id: int,
    payload: ConsultationTransition,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(require_permission("sales:leads")),
):
    """
    Transition consultation status. Only SCHEDULED -> {COMPLETED, CANCELLED, NO_SHOW} allowed.
    Only the lead owner can transition.
    """
    current_user_id = user.get("user_id")
    
    consultation = db.query(ConsultationBooking).filter(
        ConsultationBooking.id == consultation_id
    ).first()
    
    if not consultation:
        raise HTTPException(status_code=404, detail="Consultation not found")
    
    # Verify user owns the lead
    lead = get_lead_by_id(db, consultation.lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.assigned_sales_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Only the lead owner can transition this consultation")
    
    # Validate transition (only from SCHEDULED)
    if consultation.status != ConsultationStatus.SCHEDULED:
        raise HTTPException(
            status_code=400,
            detail=f"Can only transition from SCHEDULED status, current status is {consultation.status.value}"
        )
    
    # Validate new status is allowed
    allowed_transitions = {
        ConsultationStatus.SCHEDULED: [ConsultationStatus.COMPLETED, ConsultationStatus.CANCELLED, ConsultationStatus.NO_SHOW],
    }
    
    if payload.new_status not in allowed_transitions.get(consultation.status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {consultation.status.value} to {payload.new_status.value}"
        )
    
    # Update consultation
    consultation.status = payload.new_status
    
    if payload.new_status == ConsultationStatus.COMPLETED:
        consultation.completed_at = datetime.utcnow()
    elif payload.new_status in [ConsultationStatus.CANCELLED, ConsultationStatus.NO_SHOW]:
        consultation.cancelled_at = datetime.utcnow()
        consultation.cancellation_reason = payload.cancellation_reason
        if payload.cancelled_by_actor:
            consultation.cancelled_by_actor = payload.cancelled_by_actor
    
    db.commit()
    db.refresh(consultation)
    
    return consultation
