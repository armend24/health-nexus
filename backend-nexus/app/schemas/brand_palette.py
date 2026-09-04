from pydantic import BaseModel
from datetime import datetime


class BrandPaletteRead(BaseModel):
    id: int
    name: str
    brand_color_primary: str
    brand_color_secondary: str
    brand_color_background: str
    brand_color_foreground: str
    brand_color_muted: str
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True
