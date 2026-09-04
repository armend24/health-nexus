"""Notification helper – creates a row in the notifications table."""

from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationType
from app.models.tenant_manager import TenantManager


def create_notification(
    db: Session,
    *,
    user_id: int,
    tenant_id: int,
    notification_type: NotificationType,
    title: str,
    message: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        tenant_id=tenant_id,
        type=notification_type,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(notification)
    # Caller is responsible for db.commit()
    return notification


def create_notifications_for_tenant_managers(
    db: Session,
    *,
    tenant_id: int,
    notification_type: NotificationType,
    title: str,
    message: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> list[Notification]:
    manager_user_ids = [
        row[0]
        for row in db.query(TenantManager.user_id)
        .filter(TenantManager.tenant_id == tenant_id)
        .all()
    ]

    notifications: list[Notification] = []
    for user_id in manager_user_ids:
        notifications.append(
            create_notification(
                db,
                user_id=user_id,
                tenant_id=tenant_id,
                notification_type=notification_type,
                title=title,
                message=message,
                entity_type=entity_type,
                entity_id=entity_id,
            )
        )

    return notifications
