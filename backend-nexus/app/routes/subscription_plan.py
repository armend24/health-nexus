from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.db import get_db
from sqlalchemy.orm import Session
from app.schemas.subscription_plan import SubscriptionPlanRead
from app.schemas.tenant_subscription import TenantSubscriptionRead
from app.models import SubscriptionPlan

router = APIRouter(prefix="/subscription_plan", tags=["Nexus Health Subscription Plans"])


@router.get("/", response_model=List[SubscriptionPlanRead])
def get_subscription_plans(db: Session = Depends(get_db)):
    # Returns all the Health Nexus subscription plans available
    plans = db.query(SubscriptionPlan).all()
    if not plans:
        raise HTTPException(status_code=404, detail="No subscription plans found")
    return plans
