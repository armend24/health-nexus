from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user
from app.db import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.doctor import Doctor
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.patient import Patient
from app.models.user import User
from app.schemas.appointment import AppointmentCreate
from app.routes.appointment import (
    _ensure_not_past,
    _get_doctor_overlap,
    _normalize_datetime,
    _record_status_change,
    _require_doctor,
    _validate_slot_for_doctor,
    _require_patient,
    book_appointment,
)
from app.routes.feature_flag import require_feature
from app.models.notification import NotificationType
from app.services.notification_service import create_notification

router = APIRouter(prefix="/appointments", tags=["Patient Appointments"])


@router.get("/patient/me", response_model=list[dict])
def list_my_appointments(
    status: AppointmentStatus | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all appointments for the currently authenticated patient."""
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")

    query = db.query(Appointment).filter(Appointment.patient_user_id == user_id)
    if status is not None:
        query = query.filter(Appointment.status == status)
    appointments = query.order_by(Appointment.appointment_datetime.desc()).all()

    # Build a lookup: doctor_user_id → tenant_department_id
    doctor_ids = {a.doctor_user_id for a in appointments}
    doctors_map: dict[int, int] = {}
    if doctor_ids:
        doctors = db.query(Doctor).filter(Doctor.user_id.in_(doctor_ids)).all()
        doctors_map = {d.user_id: d.tenant_department_id for d in doctors}

    return [
        {
            "id": a.id,
            "appointment_datetime": a.appointment_datetime,
            "description": a.description,
            "doctor_user_id": a.doctor_user_id,
            "patient_user_id": a.patient_user_id,
            "tenant_id": a.tenant_id,
            "department_id": doctors_map.get(a.doctor_user_id),
            "status": a.status.value,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        }
        for a in appointments
    ]


@router.get("/enrollment-status", response_model=dict)
def check_enrollment_status(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Check if the current user has an active enrollment for the given tenant."""
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")

    patient = db.query(Patient).filter_by(user_id=user_id, tenant_id=tenant_id).first()
    if not patient:
        return {"enrolled": False, "reason": "no_patient_profile"}

    enrollment = (
        db.query(Enrollment)
        .filter(
            Enrollment.tenant_id == tenant_id,
            Enrollment.patient_user_id == user_id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
        .first()
    )

    if not enrollment:
        return {"enrolled": False, "reason": "no_active_enrollment"}

    if enrollment.expires_at and enrollment.expires_at < datetime.now(timezone.utc):
        return {"enrolled": False, "reason": "enrollment_expired"}

    return {"enrolled": True}


@router.get("/tenant-doctors", response_model=list[dict])
def list_tenant_doctors(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return active doctors in the current user's tenant (derived from JWT)."""
    tenant_id = current_user.get("tenant_id")
    if tenant_id is None:
        raise HTTPException(400, "No tenant_id in token")

    doctors = (
        db.query(Doctor)
        .join(User, Doctor.user_id == User.id)
        .filter(Doctor.tenant_id == tenant_id, Doctor.is_active == True)
        .all()
    )
    return [
        {
            "id": str(d.user_id),
            "name": f"Dr. {d.user.first_name} {d.user.last_name}",
            "specialization": d.specialization,
            "department_id": str(d.tenant_department_id),
        }
        for d in doctors
    ]


@router.post(
    "/book", response_model=dict, dependencies=[Depends(require_feature("basic_appointments"))]
)
def book_appointment_endpoint(
    payload: AppointmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    appointment = book_appointment(
        db=db,
        current_user=current_user,
        tenant_id=payload.tenant_id,
        doctor_id=payload.doctor_id,
        department_id=payload.department_id,
        appointment_datetime=payload.appointment_datetime,
        duration_minutes=payload.duration_minutes,
        description=payload.description,
    )
    # Notify the doctor about the new appointment
    create_notification(
        db,
        user_id=payload.doctor_id,
        tenant_id=payload.tenant_id,
        notification_type=NotificationType.APPOINTMENT_CREATED,
        title="New Appointment Request",
        message=f"A patient has requested an appointment on {payload.appointment_datetime}.",
        entity_type="appointment",
        entity_id=appointment.id,
    )
    db.commit()
    return {"id": appointment.id, "status": appointment.status.value}


@router.patch("/{appointment_id}/reschedule", response_model=dict)
def reschedule_appointment(
    appointment_id: int,
    payload: AppointmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    normalized_dt = _normalize_datetime(payload.appointment_datetime)
    _ensure_not_past(normalized_dt)
    user_id = _require_patient(current_user, db, payload.tenant_id)
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    if appointment.patient_user_id != user_id:
        raise HTTPException(403, "You can only reschedule your own appointments")
    if appointment.tenant_id != payload.tenant_id:
        raise HTTPException(400, "Tenant mismatch for appointment")
    if appointment.status in (AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED):
        raise HTTPException(400, "This appointment cannot be rescheduled")

    doctor = (
        db.query(Doctor)
        .filter(
            Doctor.user_id == payload.doctor_id,
            Doctor.tenant_id == payload.tenant_id,
            Doctor.tenant_department_id == payload.department_id,
            Doctor.is_active == True,
        )
        .first()
    )
    if not doctor:
        raise HTTPException(404, "Doctor not found in this department")

    _validate_slot_for_doctor(doctor, normalized_dt, payload.duration_minutes)

    conflict = _get_doctor_overlap(
        db=db,
        doctor_id=payload.doctor_id,
        start_dt=normalized_dt,
        duration_minutes=payload.duration_minutes,
        exclude_appointment_id=appointment.id,
        statuses=(AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED),
    )
    if conflict:
        raise HTTPException(
            400,
            {
                "message": "Time slot already booked",
                "conflict_appointment_id": conflict.id,
            },
        )

    appointment.appointment_datetime = normalized_dt
    appointment.duration_minutes = payload.duration_minutes
    appointment.description = payload.description
    appointment.doctor_user_id = payload.doctor_id
    if appointment.status != AppointmentStatus.REQUESTED:
        old_status = appointment.status
        appointment.status = AppointmentStatus.REQUESTED
        _record_status_change(
            db=db,
            appointment=appointment,
            old_status=old_status,
            new_status=AppointmentStatus.REQUESTED,
            changed_by=user_id,
        )

    # Notify the doctor about the reschedule
    create_notification(
        db,
        user_id=appointment.doctor_user_id,
        tenant_id=appointment.tenant_id,
        notification_type=NotificationType.APPOINTMENT_RESCHEDULED,
        title="Appointment Rescheduled",
        message=f"A patient has rescheduled their appointment to {normalized_dt}.",
        entity_type="appointment",
        entity_id=appointment.id,
    )
    db.commit()
    db.refresh(appointment)
    return {"id": appointment.id, "status": appointment.status.value}


@router.patch("/{appointment_id}/cancel", response_model=dict)
def cancel_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")

    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(404, "Appointment not found")

    role = str(current_user.get("role", "")).upper()
    is_doctor = False
    if role == "DOCTOR" and appointment.doctor_user_id == user_id:
        try:
            _require_doctor(current_user, db, tenant_id=appointment.tenant_id)
            is_doctor = True
        except HTTPException:
            is_doctor = False

    patient_profile = (
        db.query(Patient)
        .filter(
            Patient.user_id == user_id,
            Patient.tenant_id == appointment.tenant_id,
        )
        .first()
    )
    is_patient = appointment.patient_user_id == user_id and patient_profile is not None
    if not (is_doctor or is_patient):
        raise HTTPException(403, "You can only cancel your own appointments")

    if appointment.status == AppointmentStatus.CANCELLED:
        return {"id": appointment.id, "status": appointment.status.value}
    if appointment.status == AppointmentStatus.COMPLETED:
        raise HTTPException(400, "This appointment cannot be cancelled")

    old_status = appointment.status
    appointment.status = AppointmentStatus.CANCELLED
    _record_status_change(
        db=db,
        appointment=appointment,
        old_status=old_status,
        new_status=AppointmentStatus.CANCELLED,
        changed_by=user_id,
    )
    # Notify the doctor about the cancellation
    create_notification(
        db,
        user_id=appointment.doctor_user_id,
        tenant_id=appointment.tenant_id,
        notification_type=NotificationType.APPOINTMENT_CANCELLED,
        title="Appointment Cancelled",
        message="A patient has cancelled their appointment.",
        entity_type="appointment",
        entity_id=appointment.id,
    )
    db.commit()
    db.refresh(appointment)
    return {"id": appointment.id, "status": appointment.status.value}
