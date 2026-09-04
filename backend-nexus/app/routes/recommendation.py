from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user
from app.db import get_db
from app.models import Appointment, AppointmentStatus, Recommendation
from app.routes.appointment import _require_doctor
from app.schemas.recommendation import DoctorRecommendationCreate, RecommendationRead

router = APIRouter(tags=["Recommendations"])

ALLOWED_RECOMMENDATION_CATEGORIES = {
    "FOLLOW_UP",
    "CARE_PLAN",
    "LAB_TEST",
    "THERAPY",
    "WELLNESS",
    "SUPPLEMENT",
}


@router.post("/recommendations", response_model=RecommendationRead)
def create_recommendation(
    payload: DoctorRecommendationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Endpoint for doctors to create a recommendation for a completed appointment.
    - Only allowed for the doctor assigned to the appointment.
    - Only allowed after appointment completion.
    - Category must be in allowed set.
    - Recommendation type must be provided.
    - Handles duplicate recommendations gracefully.
    Returns the created Recommendation object.
    """
    appointment = (
        db.query(Appointment).filter(Appointment.id == payload.appointment_id).first()
    )
    if not appointment:
        raise HTTPException(404, "Appointment not found")

    doctor = _require_doctor(current_user, db, tenant_id=appointment.tenant_id)
    if appointment.doctor_user_id != doctor.user_id:
        raise HTTPException(403, "You can only create recommendations for your own appointments")
    if appointment.status != AppointmentStatus.COMPLETED:
        raise HTTPException(400, "Recommendations for offers can only be created after completion")

    category = payload.category.strip().upper()
    recommendation_type = payload.recommendation_type.strip()
    if category not in ALLOWED_RECOMMENDATION_CATEGORIES:
        raise HTTPException(400, "Unsupported recommendation category")
    if not recommendation_type:
        raise HTTPException(400, "Recommendation type is required")

    recommendation = Recommendation(
        appointment_id=appointment.id,
        doctor_id=appointment.doctor_user_id,
        client_id=appointment.patient_user_id,
        category=category,
        recommendation_type=recommendation_type,
        approved=payload.approved,
    )
    db.add(recommendation)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409,
            "A recommendation with this category and type already exists for the appointment",
        )

    db.refresh(recommendation)
    return recommendation
