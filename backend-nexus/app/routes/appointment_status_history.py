from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user
from app.db import get_db
from app.models.appointment import Appointment
from app.models.appointment_status_history import AppointmentStatusHistory
from app.schemas.appointment_status_history import AppointmentStatusHistoryRead

router = APIRouter(prefix="/appointments", tags=["Appointment Status History"])


@router.get("/{appointment_id}/status-history", response_model=list[AppointmentStatusHistoryRead])
def get_appointment_status_history(
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
    is_doctor = role == "DOCTOR" and appointment.doctor_user_id == user_id
    is_patient = appointment.patient_user_id == user_id
    if not (is_doctor or is_patient):
        raise HTTPException(403, "You cannot view this appointment history")

    return (
        db.query(AppointmentStatusHistory)
        .filter(AppointmentStatusHistory.appointment_id == appointment_id)
        .order_by(AppointmentStatusHistory.changed_at.asc())
        .all()
    )
