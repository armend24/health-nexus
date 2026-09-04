"""Brand palettes for tenant branding (color dropdown). No auth required."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.brand_palette import BrandPalette
from app.schemas.brand_palette import BrandPaletteRead

router = APIRouter(prefix="/brands", tags=["Brands"])


@router.get("", response_model=list[BrandPaletteRead])
def list_brands(db: Session = Depends(get_db)):
    """List brand palettes (color presets) for tenant branding dropdown."""
    return db.query(BrandPalette).order_by(BrandPalette.sort_order, BrandPalette.name).all()
