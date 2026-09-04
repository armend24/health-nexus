"""Global departments (e.g. for dropdown when adding department to tenant)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.department import Department
from app.schemas.department import DepartmentRead

router = APIRouter(prefix="/departments", tags=["Departments"])


@router.get("", response_model=list[DepartmentRead])
def list_departments(db: Session = Depends(get_db)):
    return db.query(Department).order_by(Department.name).all()
