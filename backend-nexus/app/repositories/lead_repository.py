"""
Repository functions for lead data access.
"""

from typing import Optional, List
from sqlalchemy.orm import Session
from app.models import Lead, LeadStatus


def get_lead_by_id(db: Session, lead_id: int) -> Optional[Lead]:
    """
    Retrieve a lead by its primary key.
    
    Args:
        db: Active SQLAlchemy session
        lead_id: Primary key of the lead
    
    Returns:
        The Lead instance if found, otherwise None
    """
    return db.query(Lead).filter(Lead.id == lead_id).first()


def list_unclaimed_leads(
    db: Session,
    status: Optional[LeadStatus] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "created_at",
    limit: int = 20,
    offset: int = 0,
) -> tuple[List[Lead], int]:
    """
    List unclaimed leads (assigned_sales_user_id IS NULL) with optional filtering.
    
    Args:
        db: Active SQLAlchemy session
        status: Optional - filter by single LeadStatus
        source: Optional - filter by source string
        search: Optional - search term to match against organization_name, contact_name, contact_email, licence_number
        sort: Sort field with direction (created_at for ASC, -created_at for DESC)
        limit: Number of results per page
        offset: Pagination offset
    
    Returns:
        Tuple of (lead_list, total_count) where lead_list is paginated
    """
    # Base query: only unclaimed leads, excluding terminal states
    query = db.query(Lead).filter(
        Lead.assigned_sales_user_id.is_(None),
        Lead.status.notin_([LeadStatus.CONVERTED, LeadStatus.REJECTED, LeadStatus.LOST]),
    )
    
    # Add optional filters
    if status is not None:
        query = query.filter(Lead.status == status)
    
    if source is not None:
        query = query.filter(Lead.source == source)
    
    # Add search filter (case-insensitive substring match across multiple fields)
    if search is not None and search.strip():
        search_term = f"%{search}%"
        query = query.filter(
            (Lead.organization_name.ilike(search_term)) |
            (Lead.contact_name.ilike(search_term)) |
            (Lead.contact_email.ilike(search_term)) |
            (Lead.licence_number.ilike(search_term))
        )
    
    # Get total count before pagination
    total = query.count()
    
    # Handle sort (default created_at ASC, with - prefix for DESC)
    if sort.startswith("-"):
        sort_field = sort[1:]
        is_desc = True
    else:
        sort_field = sort
        is_desc = False
    
    # Apply sort
    if sort_field == "created_at":
        if is_desc:
            query = query.order_by(Lead.created_at.desc())
        else:
            query = query.order_by(Lead.created_at.asc())
    # Add other sort fields as needed (e.g., status, organization_name)
    
    # Apply pagination
    leads = query.offset(offset).limit(limit).all()
    
    return leads, total


def list_my_leads(
    db: Session,
    user_id: int,
    status: Optional[LeadStatus] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "created_at",
    limit: int = 20,
    offset: int = 0,
) -> tuple[List[Lead], int]:
    """
    List leads assigned to a specific sales user.
    
    Args:
        db: Active SQLAlchemy session
        user_id: Sales user's ID (from JWT token)
        status: Optional - filter by single LeadStatus
        source: Optional - filter by source string
        search: Optional - search term to match against organization_name, contact_name, contact_email, licence_number
        sort: Sort field with direction (created_at for ASC, -created_at for DESC)
        limit: Number of results per page
        offset: Pagination offset
    
    Returns:
        Tuple of (lead_list, total_count) where lead_list is paginated
    """
    # Base query: only leads assigned to this user
    query = db.query(Lead).filter(Lead.assigned_sales_user_id == user_id)
    
    # Add optional filters
    if status is not None:
        query = query.filter(Lead.status == status)
    
    if source is not None:
        query = query.filter(Lead.source == source)
    
    # Add search filter (case-insensitive substring match across multiple fields)
    if search is not None and search.strip():
        search_term = f"%{search}%"
        query = query.filter(
            (Lead.organization_name.ilike(search_term)) |
            (Lead.contact_name.ilike(search_term)) |
            (Lead.contact_email.ilike(search_term)) |
            (Lead.licence_number.ilike(search_term))
        )
    
    # Get total count before pagination
    total = query.count()
    
    # Handle sort (default created_at ASC, with - prefix for DESC)
    if sort.startswith("-"):
        sort_field = sort[1:]
        is_desc = True
    else:
        sort_field = sort
        is_desc = False
    
    # Apply sort
    if sort_field == "created_at":
        if is_desc:
            query = query.order_by(Lead.created_at.desc())
        else:
            query = query.order_by(Lead.created_at.asc())
    
    # Apply pagination
    leads = query.offset(offset).limit(limit).all()
    
    return leads, total
