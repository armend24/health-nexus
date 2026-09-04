from sqlalchemy.orm import Session
from app.models.tenant_audit_log import TenantAuditLog


def create_audit_log(
    db: Session,
    tenant_id: int,
    event_type: str,
    entity_name: str,
    entity_id: int | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    performed_by_user_id: int | None = None,
    performed_by_role: str | None = None,
    ip_address: str | None = None,
    reason: str | None = None,
):
    audit = TenantAuditLog(
        tenant_id=tenant_id,
        event_type=event_type,
        entity_name=entity_name,
        entity_id=entity_id,
        old_value=old_value,
        new_value=new_value,
        performed_by_user_id=performed_by_user_id,
        performed_by_role=performed_by_role,
        ip_address=ip_address,
        reason=reason,
    )

    db.add(audit)
    db.flush()

    return audit
