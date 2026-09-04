from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from app.models.lead import LeadStatus
from app.models.consultation_booking import ConsultationStatus, CancelledByActor


class LeadCreate(BaseModel):
    """Request schema for creating a new lead from public consultation form."""
    
    licence_number: str = Field(..., description="Medical license number")
    organization_name: str = Field(..., description="Name of the organization")
    contact_name: str = Field(..., description="Full name of contact person")
    contact_email: str = Field(..., description="Email of contact person")
    contact_phone: Optional[str] = Field(None, description="Phone number (optional)")
    initial_message: Optional[str] = Field(None, description="Initial inquiry/message (optional)")
    source: Optional[str] = Field(None, description="How the lead was acquired (optional)")


class PublicLeadCreate(BaseModel):
    """Schema for public consultation/contact form (legacy endpoint compatibility)."""
    tenant_name: str
    contact_email: str
    description: str | None = None


class LeadRead(BaseModel):
    """Response schema for a lead."""
    
    id: int
    licence_number: str
    organization_name: str
    contact_name: str
    contact_email: str
    contact_phone: Optional[str] = None
    initial_message: Optional[str] = None
    source: Optional[str] = None
    
    status: LeadStatus
    assigned_sales_user_id: Optional[int] = None
    next_action: Optional[str] = None
    next_action_due_at: Optional[datetime] = None
    
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class LeadCreateResponse(BaseModel):
    """Minimal response schema for POST /leads (public endpoint)."""
    
    id: int
    licence_number: str
    organization_name: str
    contact_name: str
    contact_email: str
    contact_phone: Optional[str] = None
    initial_message: Optional[str] = None
    status: LeadStatus
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class LeadListItem(BaseModel):
    """Minimal lead item for list responses (GET /leads)."""
    
    id: int
    licence_number: str
    organization_name: str
    contact_name: str
    contact_email: str
    status: LeadStatus
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class LeadListResponse(BaseModel):
    """Paginated response for listing unclaimed leads."""
    
    items: List[LeadListItem]
    total: int
    page: int
    page_size: int


class FollowUpUpdate(BaseModel):
    """Request schema for updating lead follow-up actions."""
    
    next_action: Optional[str] = Field(None, description="Next planned action (optional)")
    next_action_due_at: Optional[datetime] = Field(None, description="Due date for next action (optional)")
    
    model_config = ConfigDict(from_attributes=True)


class LeadTransition(BaseModel):
    """Request schema for transitioning lead status."""
    
    new_status: LeadStatus = Field(..., description="New status to transition to")
    reason: Optional[str] = Field(None, description="Reason for transition (required for some transitions)")
    
    model_config = ConfigDict(from_attributes=True)


class LeadStatusPublic(BaseModel):
    """Public response schema for lead status tracking (no auth required)."""
    
    request_id: int = Field(..., description="Lead ID (request identifier)")
    status: LeadStatus
    contact_email: str
    organization_name: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class LeadStatusHistoryItem(BaseModel):
    """Individual status transition record."""
    
    id: int
    lead_id: int
    old_status: LeadStatus
    new_status: LeadStatus
    changed_by_user_id: int
    changed_at: datetime
    reason: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class LeadStatusHistoryListResponse(BaseModel):
    """Paginated response for lead status history."""
    
    items: List[LeadStatusHistoryItem]
    total: int
    page: int
    page_size: int


# Consultation Schemas

class ConsultationCreate(BaseModel):
    """Request schema for creating a consultation booking."""
    
    scheduled_at: datetime = Field(..., description="Date and time when the consultation will occur")
    duration_minutes: int = Field(..., gt=0, le=60, description="Duration of the consultation in minutes (1–60)")
    location: str = Field(..., description="Meeting location or platform (e.g., 'Google Meet', 'Zoom', 'Phone Call', 'Clinic Office')")
    meeting_link: Optional[str] = Field(None, description="URL for online meeting (optional, use for virtual consultations)")


class ConsultationRead(BaseModel):
    """Response schema for a consultation booking."""
    
    id: int
    lead_id: int
    scheduled_at: datetime
    duration_minutes: int
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    status: ConsultationStatus
    created_by_user_id: int
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancelled_by_actor: Optional[CancelledByActor] = None
    cancellation_reason: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ConsultationListResponse(BaseModel):
    """Paginated response for listing consultations."""
    
    items: List[ConsultationRead]
    total: int
    page: int
    page_size: int


class LeadStatusHistoryItem(BaseModel):
    """Single status history entry."""
    
    id: int
    lead_id: int
    old_status: LeadStatus
    new_status: LeadStatus
    reason: Optional[str] = None
    changed_by_user_id: int
    changed_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class LeadStatusHistoryList(BaseModel):
    """Response schema for listing lead status history."""
    
    items: List[LeadStatusHistoryItem]
    total: int

    model_config = ConfigDict(from_attributes=True)


class PublicLeadTrackingStep(BaseModel):
    """
    One step of the public lead roadmap.

    state values are intentionally UI-friendly:
    - DONE (green)
    - IN_PROGRESS (orange)
    - NOT_STARTED (gray)
    """

    status: str
    state: str


class PublicLeadTrackingRead(BaseModel):
    """
    Public-safe lead tracking payload.

    Uses lead_id + contact email verification in the route layer
    so the frontend can render a status roadmap without authentication.
    """

    lead_id: int
    organization_name: str | None = None
    contact_email: str | None = None
    current_status: str
    created_at: datetime
    updated_at: datetime
    roadmap: list[PublicLeadTrackingStep]
