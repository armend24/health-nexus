from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user
from app.db import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User
from app.routes.appointment import (
    _get_doctor_overlap,
    _record_status_change,
    _require_doctor,
)
from app.models.notification import NotificationType
from app.services.notification_service import create_notification
from app.services.offer_service import on_appointment_completed

router = APIRouter(prefix="/appointments", tags=["Doctor Appointments"])


@router.get("/doctor/me", response_model=list[dict])
def list_my_appointments(
    status: AppointmentStatus | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    doctor = _require_doctor(current_user, db)
    query = db.query(Appointment).filter(
        Appointment.doctor_user_id == doctor.user_id,
        Appointment.tenant_id == doctor.tenant_id,
    )
    if status is not None:
        query = query.filter(Appointment.status == status)
    appointments = query.order_by(Appointment.appointment_datetime.asc()).all()

    # Build a lookup: patient_user_id → full name
    patient_ids = {a.patient_user_id for a in appointments}
    patients_map: dict[int, str] = {}
    if patient_ids:
        users = db.query(User).filter(User.id.in_(patient_ids)).all()
        patients_map = {u.id: f"{u.first_name} {u.last_name}" for u in users}

    return [
        {
            "id": appointment.id,
            "appointment_datetime": appointment.appointment_datetime,
            "description": appointment.description,
            "doctor_user_id": appointment.doctor_user_id,
            "patient_user_id": appointment.patient_user_id,
            "patient_name": patients_map.get(
                appointment.patient_user_id, f"Patient #{appointment.patient_user_id}"
            ),
            "tenant_id": appointment.tenant_id,
            "status": appointment.status.value,
            "created_at": appointment.created_at,
            "updated_at": appointment.updated_at,
        }
        for appointment in appointments
    ]


@router.patch("/{appointment_id}/approve", response_model=dict)
def approve_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    doctor = _require_doctor(current_user, db)
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    if appointment.doctor_user_id != doctor.user_id:
        raise HTTPException(403, "You can only approve your own appointments")
    if appointment.tenant_id != doctor.tenant_id:
        raise HTTPException(403, "You can only approve appointments in your tenant")
    if appointment.status == AppointmentStatus.CONFIRMED:
        return {"id": appointment.id, "status": appointment.status.value}
    if appointment.status in (AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED):
        raise HTTPException(400, "This appointment cannot be approved")

    conflict = _get_doctor_overlap(
        db=db,
        doctor_id=appointment.doctor_user_id,
        start_dt=appointment.appointment_datetime,
        duration_minutes=appointment.duration_minutes,
        exclude_appointment_id=appointment.id,
        statuses=(AppointmentStatus.CONFIRMED,),
    )
    if conflict:
        raise HTTPException(
            400,
            {
                "message": "Doctor already has an appointment at this time",
                "conflict_appointment_id": conflict.id,
            },
        )

    old_status = appointment.status
    appointment.status = AppointmentStatus.CONFIRMED
    _record_status_change(
        db=db,
        appointment=appointment,
        old_status=old_status,
        new_status=AppointmentStatus.CONFIRMED,
        changed_by=doctor.user_id,
    )
    # Notify the patient about confirmation
    create_notification(
        db,
        user_id=appointment.patient_user_id,
        tenant_id=appointment.tenant_id,
        notification_type=NotificationType.APPOINTMENT_CONFIRMED,
        title="Appointment Confirmed",
        message=f"Your appointment on {appointment.appointment_datetime} has been confirmed by the doctor.",
        entity_type="appointment",
        entity_id=appointment.id,
    )
    db.commit()
    db.refresh(appointment)
    return {"id": appointment.id, "status": appointment.status.value}


@router.patch("/{appointment_id}/complete", response_model=dict)
def complete_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    doctor = _require_doctor(current_user, db)
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    if appointment.doctor_user_id != doctor.user_id:
        raise HTTPException(403, "You can only complete your own appointments")
    if appointment.tenant_id != doctor.tenant_id:
        raise HTTPException(403, "You can only complete appointments in your tenant")
    if appointment.status == AppointmentStatus.COMPLETED:
        return {"id": appointment.id, "status": appointment.status.value}
    if appointment.status == AppointmentStatus.CANCELLED:
        raise HTTPException(400, "Cancelled appointments cannot be completed")
    if appointment.status != AppointmentStatus.CONFIRMED:
        raise HTTPException(400, "Only confirmed appointments can be completed")

    old_status = appointment.status
    appointment.status = AppointmentStatus.COMPLETED
    _record_status_change(
        db=db,
        appointment=appointment,
        old_status=old_status,
        new_status=AppointmentStatus.COMPLETED,
        changed_by=doctor.user_id,
    )
    # Notify the patient about completion
    create_notification(
        db,
        user_id=appointment.patient_user_id,
        tenant_id=appointment.tenant_id,
        notification_type=NotificationType.APPOINTMENT_COMPLETED,
        title="Appointment Completed",
        message="Your appointment has been marked as completed.",
        entity_type="appointment",
        entity_id=appointment.id,
    )
    on_appointment_completed(db, appointment)
    db.commit()
    db.refresh(appointment)
    return {"id": appointment.id, "status": appointment.status.value}


@router.patch("/{appointment_id}/reject", response_model=dict)
def reject_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Doctor rejects a requested appointment, freeing the slot."""
    doctor = _require_doctor(current_user, db)
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    if appointment.doctor_user_id != doctor.user_id:
        raise HTTPException(403, "You can only reject your own appointments")
    if appointment.tenant_id != doctor.tenant_id:
        raise HTTPException(403, "You can only reject appointments in your tenant")
    if appointment.status == AppointmentStatus.CANCELLED:
        return {"id": appointment.id, "status": appointment.status.value}
    if appointment.status in (AppointmentStatus.COMPLETED,):
        raise HTTPException(400, "Completed appointments cannot be rejected")

    old_status = appointment.status
    appointment.status = AppointmentStatus.CANCELLED
    _record_status_change(
        db=db,
        appointment=appointment,
        old_status=old_status,
        new_status=AppointmentStatus.CANCELLED,
        changed_by=doctor.user_id,
    )
    # Notify the patient about rejection
    create_notification(
        db,
        user_id=appointment.patient_user_id,
        tenant_id=appointment.tenant_id,
        notification_type=NotificationType.APPOINTMENT_REJECTED,
        title="Appointment Rejected",
        message="Your appointment request has been rejected by the doctor.",
        entity_type="appointment",
        entity_id=appointment.id,
    )
    db.commit()
    db.refresh(appointment)
    return {"id": appointment.id, "status": appointment.status.value}
