"""Fonts for tenant branding (font dropdown). No auth required."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.font import Font
from app.schemas.font import FontRead

router = APIRouter(prefix="/fonts", tags=["Fonts"])


@router.get("", response_model=list[FontRead])
def list_fonts(db: Session = Depends(get_db)):
    """List fonts for tenant branding dropdown."""
    return db.query(Font).order_by(Font.sort_order, Font.name).all()
