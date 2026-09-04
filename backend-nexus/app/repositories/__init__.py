"""
Repository package public interface.

This module re-exports selected repository functions from
`enrollment_repository` to provide a clean and controlled
import surface for the service layer.

By centralizing exports here:

- Services can import from `app.repositories` instead of
  referencing concrete modules directly.
- Internal helper functions can remain unexposed.
- The repository layer maintains a clear, explicit public API.
"""

# Re-export repository functions as the package API.
from .enrollment_repository import (
    get_tenant,
    get_patient_by_tenant_and_user,
    get_patient_by_user,
    get_user_tenant_plan,
    get_enrollment_by_id,
    get_enrollment_by_tenant_and_patient,
    list_enrollments_by_tenant,
    get_tenant_manager,
    get_doctor_for_user,
    insert_status_history,
    insert_audit_event,
    list_enrollment_status_history,
)

from .lead_repository import (
    get_lead_by_id,
    list_unclaimed_leads,
    list_my_leads,
)

# Explicit public exports for `from app.repositories import *`.
__all__ = [
    "get_tenant",
    "get_patient_by_tenant_and_user",
    "get_patient_by_user",
    "get_user_tenant_plan",
    "get_enrollment_by_id",
    "get_enrollment_by_tenant_and_patient",
    "list_enrollments_by_tenant",
    "get_tenant_manager",
    "get_doctor_for_user",
    "insert_status_history",
    "insert_audit_event",
    "list_enrollment_status_history",
    "get_lead_by_id",
    "list_unclaimed_leads",
    "list_my_leads",
]
