from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class FontRead(BaseModel):
    id: int
    name: str
    header_font_family: str
    body_font_family: str
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True
