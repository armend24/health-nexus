from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RecommendationBase(BaseModel):
    appointment_id: int
    doctor_id: int
    client_id: int
    category: str
    recommendation_type: str
    approved: bool = False


class RecommendationCreate(RecommendationBase):
    pass


class DoctorRecommendationCreate(BaseModel):
    appointment_id: int
    category: str
    recommendation_type: str
    approved: bool = True


class RecommendationRead(RecommendationBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
