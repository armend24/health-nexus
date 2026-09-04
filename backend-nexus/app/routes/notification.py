from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.auth.auth_utils import get_current_user
from app.db import get_db
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/me", response_model=list[dict])
def list_my_notifications(
    unread_only: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return notifications for the current user, newest first."""
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")

    query = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()
    return [
        {
            "id": n.id,
            "type": n.type.value,
            "title": n.title,
            "message": n.message,
            "is_read": n.is_read,
            "entity_type": n.entity_type,
            "entity_id": n.entity_id,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifications
    ]


@router.get("/me/unread-count", response_model=dict)
def unread_count(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return the count of unread notifications."""
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")
    count = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == user_id, Notification.is_read == False)
        .scalar()
    )
    return {"count": count}


@router.patch("/{notification_id}/read", response_model=dict)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark a single notification as read."""
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if not notification:
        raise HTTPException(404, "Notification not found")
    notification.is_read = True
    db.commit()
    return {"id": notification.id, "is_read": True}


@router.patch("/me/read-all", response_model=dict)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark all notifications as read for the current user."""
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)
        .update({"is_read": True})
    )
    db.commit()
    return {"marked_read": updated}
