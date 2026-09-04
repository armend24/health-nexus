"""
Lead service for managing lead status transitions and sales workflow.

Implements the state machine for lead progression through the sales pipeline
(NEW → QUALIFIED → CONTACTED → CONSULTATION_SCHEDULED → CONSULTATION_COMPLETED 
→ AWAITING_DECISION → CONVERTED, or terminal states REJECTED/LOST).
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Lead, LeadStatus, LeadStatusHistory, ConsultationBooking, ConsultationStatus, User
from app.schemas.lead import LeadCreate


# ===== Error Handling =====

class LeadServiceErrorCode(str, Enum):
    """Error codes for lead service operations."""
    
    LEAD_NOT_FOUND = "LEAD_NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    INVALID_TRANSITION = "INVALID_TRANSITION"
    REASON_REQUIRED = "REASON_REQUIRED"
    CONSULTATION_NOT_FOUND = "CONSULTATION_NOT_FOUND"
    CONSULTATION_INVALID_STATUS = "CONSULTATION_INVALID_STATUS"
    DATABASE_ERROR = "DATABASE_ERROR"


class LeadServiceError(Exception):
    """Exception raised for lead service errors."""
    
    def __init__(
        self,
        code: LeadServiceErrorCode,
        message: str,
        http_status: int = 400,
        details: Optional[dict] = None,
    ):
        self.code = code
        self.message = message
        self.http_status = http_status
        self.details = details or {}
        super().__init__(self.message)


# ===== Actor Context =====

@dataclass
class ActorContext:
    """
    Context about the user performing the action.
    Constructed from the JWT payload at the route layer.
    """
    user_id: int
    role: str


# ===== Lead Creation =====

def create_lead(
    payload: LeadCreate,
    session: Session,
) -> Lead:
    """
    Create a new lead from a public consultation request form with:
    - status = NEW (initial state)
    - assigned_sales_user_id = NULL (unclaimed)
    - All fields from request payload
    
    Args:
        payload: LeadCreate schema with required/optional fields
        session: SQLAlchemy session
    
    Raises:
        LeadServiceError: On database errors
    """
    try:
        lead = Lead(
            licence_number=payload.licence_number,
            organization_name=payload.organization_name,
            contact_name=payload.contact_name,
            contact_email=payload.contact_email,
            contact_phone=payload.contact_phone,
            initial_message=payload.initial_message,
            source=payload.source,
            status=LeadStatus.NEW,
            assigned_sales_user_id=None,
        )
        
        session.add(lead)
        session.commit()
        session.refresh(lead)
        
        return lead
    
    except Exception as e:
        session.rollback()
        raise LeadServiceError(
            code=LeadServiceErrorCode.DATABASE_ERROR,
            message=f"Failed to create lead: {str(e)}",
            http_status=500,
            details={"error": str(e)},
        )

VALID_LEAD_TRANSITIONS = {
    LeadStatus.NEW: [LeadStatus.QUALIFIED, LeadStatus.REJECTED],
    LeadStatus.QUALIFIED: [LeadStatus.CONTACTED, LeadStatus.LOST, LeadStatus.REJECTED],
    LeadStatus.CONTACTED: [LeadStatus.CONSULTATION_SCHEDULED, LeadStatus.LOST, LeadStatus.REJECTED],
    LeadStatus.CONSULTATION_SCHEDULED: [LeadStatus.CONSULTATION_COMPLETED, LeadStatus.CONTACTED, LeadStatus.REJECTED],
    LeadStatus.CONSULTATION_COMPLETED: [LeadStatus.AWAITING_DECISION, LeadStatus.CONVERTED, LeadStatus.LOST, LeadStatus.REJECTED],
    LeadStatus.AWAITING_DECISION: [LeadStatus.CONVERTED, LeadStatus.LOST, LeadStatus.CONTACTED, LeadStatus.REJECTED],
    LeadStatus.CONVERTED: [],  # Terminal state
    LeadStatus.REJECTED: [],   # Terminal state
    LeadStatus.LOST: [],       # Terminal state
}

# Transitions that do NOT require a reason
TRANSITIONS_WITHOUT_REASON = {
    (LeadStatus.NEW, LeadStatus.QUALIFIED),
    (LeadStatus.QUALIFIED, LeadStatus.CONTACTED),
    (LeadStatus.CONTACTED, LeadStatus.CONSULTATION_SCHEDULED),
    (LeadStatus.CONSULTATION_SCHEDULED, LeadStatus.CONSULTATION_COMPLETED),
    (LeadStatus.AWAITING_DECISION, LeadStatus.CONVERTED),
}


# ===== Helper Functions =====

def _ensure_actor_owns_lead(lead: Lead, actor: ActorContext) -> None:
    """
    Ensure the actor is the assigned sales user for the lead.
    
    Raises:
        LeadServiceError: If actor does not own the lead.
    """
    if lead.assigned_sales_user_id != actor.user_id:
        raise LeadServiceError(
            code=LeadServiceErrorCode.UNAUTHORIZED,
            message=f"User {actor.user_id} cannot transition lead {lead.id}: not assigned to this user",
            http_status=403,
            details={"lead_id": lead.id, "assigned_user_id": lead.assigned_sales_user_id},
        )


def _is_reason_required(current_status: LeadStatus, new_status: LeadStatus) -> bool:
    """
    Determine if a reason is required for this transition.
    
    Args:
        current_status: The current status of the lead
        new_status: The desired new status
    
    Returns:
        True if a reason is required, False otherwise.
    """
    return (current_status, new_status) not in TRANSITIONS_WITHOUT_REASON


def _validate_consultation_exists_and_scheduled(
    lead_id: int,
    session: Session,
) -> ConsultationBooking:
    """
    Validate that a consultation booking exists for the lead with SCHEDULED status.
    
    Used when transitioning to CONSULTATION_SCHEDULED.
    
    Raises:
        LeadServiceError: If no active consultation booking exists.
    """
    consultation = (
        session.query(ConsultationBooking)
        .filter(
            ConsultationBooking.lead_id == lead_id,
            ConsultationBooking.status == ConsultationStatus.SCHEDULED,
        )
        .first()
    )
    
    if not consultation:
        raise LeadServiceError(
            code=LeadServiceErrorCode.CONSULTATION_NOT_FOUND,
            message=f"No SCHEDULED consultation booking found for lead {lead_id}",
            http_status=400,
            details={"lead_id": lead_id},
        )
    
    return consultation


def _validate_consultation_completed(
    lead_id: int,
    session: Session,
) -> ConsultationBooking:
    """
    Validate that a consultation booking exists for the lead with COMPLETED status.
    
    Used when transitioning to CONSULTATION_COMPLETED.
    
    Raises:
        LeadServiceError: If no completed consultation booking exists.
    """
    consultation = (
        session.query(ConsultationBooking)
        .filter(
            ConsultationBooking.lead_id == lead_id,
            ConsultationBooking.status == ConsultationStatus.COMPLETED,
        )
        .first()
    )
    
    if not consultation:
        raise LeadServiceError(
            code=LeadServiceErrorCode.CONSULTATION_INVALID_STATUS,
            message=f"No COMPLETED consultation booking found for lead {lead_id}",
            http_status=400,
            details={"lead_id": lead_id},
        )
    
    return consultation


def _validate_consultation_cancelled_or_noshow(
    lead_id: int,
    session: Session,
) -> ConsultationBooking:
    """
    Validate that a consultation booking exists for the lead with CANCELLED or NO_SHOW status.
    
    Used when transitioning CONSULTATION_SCHEDULED → CONTACTED (after cancellation/no-show).
    
    Raises:
        LeadServiceError: If no cancelled/no-show consultation booking exists.
    """
    consultation = (
        session.query(ConsultationBooking)
        .filter(
            ConsultationBooking.lead_id == lead_id,
            ConsultationBooking.status.in_([ConsultationStatus.CANCELLED, ConsultationStatus.NO_SHOW]),
        )
        .first()
    )
    
    if not consultation:
        raise LeadServiceError(
            code=LeadServiceErrorCode.CONSULTATION_INVALID_STATUS,
            message=f"No CANCELLED or NO_SHOW consultation booking found for lead {lead_id}",
            http_status=400,
            details={"lead_id": lead_id},
        )
    
    return consultation


# ===== Main Transition Function =====

def transition_lead(
    lead_id: int,
    new_status: LeadStatus,
    actor: ActorContext,
    session: Session,
    reason: Optional[str] = None,
) -> Lead:
    """
    Transition a lead from its current status to a new status.
    
    Validates:
    - Lead exists
    - Actor owns the lead (assigned_sales_user_id matches)
    - Transition is valid according to VALID_LEAD_TRANSITIONS
    - Reason is provided when required
    - Business rules (e.g., consultation booking exists/status is correct)
    
    On success:
    - Updates lead.status
    - Creates LeadStatusHistory entry with reason
    - Commits to database
    
    Args:
        lead_id: ID of the lead to transition
        new_status: The desired new status
        actor: Context about the user performing the action
        session: SQLAlchemy session
        reason: Optional reason for the transition (required for some transitions)
    
    Returns:
        The updated Lead object
    
    Raises:
        LeadServiceError: On any validation failure
    """
    try:
        # Fetch lead
        lead = session.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            raise LeadServiceError(
                code=LeadServiceErrorCode.LEAD_NOT_FOUND,
                message=f"Lead {lead_id} not found",
                http_status=404,
                details={"lead_id": lead_id},
            )
        
        # Check authorization
        _ensure_actor_owns_lead(lead, actor)
        
        current_status = lead.status
        
        # Check if transition is valid
        if new_status not in VALID_LEAD_TRANSITIONS.get(current_status, []):
            raise LeadServiceError(
                code=LeadServiceErrorCode.INVALID_TRANSITION,
                message=f"Cannot transition from {current_status} to {new_status}",
                http_status=400,
                details={
                    "current_status": current_status,
                    "new_status": new_status,
                    "valid_transitions": VALID_LEAD_TRANSITIONS.get(current_status, []),
                },
            )
        
        # Check if reason is required
        if _is_reason_required(current_status, new_status) and not reason:
            raise LeadServiceError(
                code=LeadServiceErrorCode.REASON_REQUIRED,
                message=f"Reason required for transition from {current_status} to {new_status}",
                http_status=400,
                details={
                    "current_status": current_status,
                    "new_status": new_status,
                },
            )
        
        # ===== Business Rule Validations =====
        
        # Validate consultation bookings based on target status
        if new_status == LeadStatus.CONSULTATION_SCHEDULED:
            _validate_consultation_exists_and_scheduled(lead_id, session)
        
        if new_status == LeadStatus.CONSULTATION_COMPLETED:
            _validate_consultation_completed(lead_id, session)
        
        if current_status == LeadStatus.CONSULTATION_SCHEDULED and new_status == LeadStatus.CONTACTED:
            _validate_consultation_cancelled_or_noshow(lead_id, session)
        
        # ===== Perform Transition =====
        
        # Update lead status
        lead.status = new_status
        session.add(lead)
        session.flush()  # Flush to ensure lead is updated before creating history
        
        # Create history record
        history = LeadStatusHistory(
            lead_id=lead_id,
            old_status=current_status,
            new_status=new_status,
            changed_by_user_id=actor.user_id,
            reason=reason,
            changed_at=datetime.utcnow(),
        )
        session.add(history)
        
        # Commit transaction
        session.commit()
        
        return lead
    
    except LeadServiceError:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise LeadServiceError(
            code=LeadServiceErrorCode.DATABASE_ERROR,
            message=f"Database error during transition: {str(e)}",
            http_status=500,
            details={"error": str(e)},
        )
