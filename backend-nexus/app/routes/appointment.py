from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.appointment import Appointment, AppointmentStatus
from app.models.appointment_status_history import AppointmentStatusHistory
from app.models.doctor import Doctor
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.patient import Patient

router = APIRouter(prefix="/appointments", tags=["Appointments"])


def _normalize_datetime(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        normalized = dt.replace(tzinfo=timezone.utc)
    else:
        normalized = dt.astimezone(timezone.utc)
    return normalized.replace(second=0, microsecond=0)


def _has_doctor_overlap(
    db: Session,
    doctor_id: int,
    start_dt: datetime,
    duration_minutes: int = 30,
    *,
    exclude_appointment_id: int | None = None,
    statuses: tuple[AppointmentStatus, ...] = (
        AppointmentStatus.REQUESTED,
        AppointmentStatus.CONFIRMED,
    ),
) -> bool:
    return (
        _get_doctor_overlap(
            db=db,
            doctor_id=doctor_id,
            start_dt=start_dt,
            duration_minutes=duration_minutes,
            exclude_appointment_id=exclude_appointment_id,
            statuses=statuses,
        )
        is not None
    )


def _get_doctor_overlap(
    db: Session,
    doctor_id: int,
    start_dt: datetime,
    duration_minutes: int = 30,
    *,
    exclude_appointment_id: int | None = None,
    statuses: tuple[AppointmentStatus, ...] = (
        AppointmentStatus.REQUESTED,
        AppointmentStatus.CONFIRMED,
    ),
) -> Appointment | None:
    start_dt = _normalize_datetime(start_dt)
    end_dt = start_dt + timedelta(minutes=duration_minutes)

    query = db.query(Appointment).filter(
        Appointment.doctor_user_id == doctor_id,
        Appointment.status.in_(statuses),
    )
    if exclude_appointment_id is not None:
        query = query.filter(Appointment.id != exclude_appointment_id)

    for existing in query.all():
        existing_start = _normalize_datetime(existing.appointment_datetime)
        existing_end = existing_start + timedelta(minutes=existing.duration_minutes)
        if existing_start < end_dt and start_dt < existing_end:
            return existing
    return None


def _parse_work_block(block: object) -> tuple[str, str]:
    if isinstance(block, dict):
        start = block.get("start")
        end = block.get("end")
    elif isinstance(block, (list, tuple)) and len(block) == 2:
        start, end = block[0], block[1]
    else:
        raise HTTPException(400, "Invalid doctor working hours format")

    if not isinstance(start, str) or not isinstance(end, str):
        raise HTTPException(400, "Invalid doctor working hours format")

    return start, end


def _normalize_day_blocks(day_blocks: object) -> list[object]:
    if (
        isinstance(day_blocks, list)
        and len(day_blocks) == 2
        and isinstance(day_blocks[0], str)
        and isinstance(day_blocks[1], str)
    ):
        return [day_blocks]
    if isinstance(day_blocks, list):
        return day_blocks
    raise HTTPException(400, "Invalid doctor working hours format")


def _require_doctor(current_user: dict, db: Session, tenant_id: int | None = None) -> Doctor:
    role = str(current_user.get("role", "")).upper()
    if role != "DOCTOR":
        raise HTTPException(403, "Only doctors can perform this action")

    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")

    query = db.query(Doctor).filter(
        Doctor.user_id == user_id,
        Doctor.is_active == True,
    )
    if tenant_id is not None:
        query = query.filter(Doctor.tenant_id == tenant_id)

    doctor = query.first()
    if not doctor:
        raise HTTPException(403, "Doctor profile not found")

    return doctor


def _require_patient(current_user: dict, db: Session, tenant_id: int) -> int:
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")

    patient = db.query(Patient).filter_by(user_id=user_id, tenant_id=tenant_id).first()
    if not patient:
        raise HTTPException(403, "Only patients can perform this action")

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
        raise HTTPException(403, "You are not enrolled in this tenant")

    if enrollment.expires_at and enrollment.expires_at < datetime.now(timezone.utc):
        raise HTTPException(403, "Your plan has expired")

    return user_id


def _record_status_change(
    db: Session,
    appointment: Appointment,
    old_status: AppointmentStatus | None,
    new_status: AppointmentStatus,
    changed_by: int | None,
):
    db.add(
        AppointmentStatusHistory(
            appointment_id=appointment.id,
            old_status=old_status,
            new_status=new_status,
            changed_by=changed_by,
        )
    )


def _validate_slot_for_doctor(
    doctor: Doctor,
    appointment_datetime: datetime,
    duration_minutes: int,
):
    appointment_datetime = _normalize_datetime(appointment_datetime)
    weekday = appointment_datetime.strftime("%A").lower()
    working_hours = doctor.working_hours or {}
    if weekday not in working_hours:
        raise HTTPException(400, "Doctor does not work this day")

    appointment_end = appointment_datetime + timedelta(minutes=duration_minutes)
    valid_slot = False
    for block in _normalize_day_blocks(working_hours[weekday]):
        start_str, end_str = _parse_work_block(block)
        block_start = datetime.strptime(start_str, "%H:%M").time()
        block_end = datetime.strptime(end_str, "%H:%M").time()
        if block_start <= appointment_datetime.time() and appointment_end.time() <= block_end:
            valid_slot = True
            break

    if not valid_slot:
        raise HTTPException(400, "Outside doctor's working hours")


def _ensure_not_past(appointment_datetime: datetime):
    normalized = _normalize_datetime(appointment_datetime)
    now_utc = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    if normalized < now_utc:
        raise HTTPException(400, "Cannot book or reschedule appointments in the past")


def get_available_slots(db: Session, doctor_id: int, day_dt: datetime):
    doctor = db.query(Doctor).filter_by(user_id=doctor_id).first()
    if not doctor:
        raise HTTPException(404, "Doctor not found")

    weekday = day_dt.strftime("%A").lower()
    working_hours = doctor.working_hours or {}
    if weekday not in working_hours:
        return []

    slots = []
    slot_duration = 30
    for block in _normalize_day_blocks(working_hours[weekday]):
        start_str, end_str = _parse_work_block(block)
        start = datetime.combine(day_dt.date(), datetime.strptime(start_str, "%H:%M").time())
        end = datetime.combine(day_dt.date(), datetime.strptime(end_str, "%H:%M").time())

        current = start
        while current + timedelta(minutes=slot_duration) <= end:
            current_norm = _normalize_datetime(current)
            if not _has_doctor_overlap(
                db=db,
                doctor_id=doctor_id,
                start_dt=current_norm,
                duration_minutes=slot_duration,
                statuses=(AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED),
            ):
                slots.append(current)
            current += timedelta(minutes=slot_duration)

    return slots


def book_appointment(
    db: Session,
    current_user: dict,
    tenant_id: int,
    doctor_id: int,
    department_id: int,
    appointment_datetime: datetime,
    duration_minutes: int = 30,
    description: str | None = None,
):
    appointment_datetime = _normalize_datetime(appointment_datetime)
    _ensure_not_past(appointment_datetime)
    user_id = current_user.get("user_id")
    if user_id is None:
        raise HTTPException(401, "Invalid token payload")

    try:
        _require_patient(current_user, db, tenant_id)
        enrollment = (
            db.query(Enrollment)
            .filter(
                Enrollment.tenant_id == tenant_id,
                Enrollment.patient_user_id == user_id,
                Enrollment.status == EnrollmentStatus.ACTIVE,
            )
            .first()
        )

        doctor = (
            db.query(Doctor)
            .filter(
                Doctor.user_id == doctor_id,
                Doctor.tenant_id == tenant_id,
                Doctor.tenant_department_id == department_id,
                Doctor.is_active == True,
            )
            .first()
        )
        if not doctor:
            raise HTTPException(404, "Doctor not found in this department")

        plan = enrollment.user_tenant_plan
        if plan.max_appointments:
            appointment_count = (
                db.query(Appointment)
                .filter(
                    Appointment.patient_user_id == user_id,
                    Appointment.tenant_id == tenant_id,
                    Appointment.status.in_(
                        [AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED]
                    ),
                )
                .count()
            )
            if appointment_count >= plan.max_appointments:
                raise HTTPException(403, "Appointment limit reached for your plan")

        _validate_slot_for_doctor(doctor, appointment_datetime, duration_minutes)

        conflict = _get_doctor_overlap(
            db=db,
            doctor_id=doctor_id,
            start_dt=appointment_datetime,
            duration_minutes=duration_minutes,
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

        appointment = Appointment(
            appointment_datetime=appointment_datetime,
            duration_minutes=duration_minutes,
            description=description,
            doctor_user_id=doctor_id,
            patient_user_id=user_id,
            tenant_id=tenant_id,
        )

        db.add(appointment)
        db.flush()
        _record_status_change(
            db=db,
            appointment=appointment,
            old_status=None,
            new_status=AppointmentStatus.REQUESTED,
            changed_by=user_id,
        )
        db.commit()
        db.refresh(appointment)
        return appointment
    except SQLAlchemyError:
        db.rollback()
        raise


@router.get("/doctor/{doctor_id}/availability", response_model=list[datetime])
def doctor_availability(
    doctor_id: int,
    booking_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
):
    return get_available_slots(
        db=db,
        doctor_id=doctor_id,
        day_dt=datetime.combine(booking_date, datetime.min.time()),
    )
