"""reports table base

Revision ID: 3b5978b617fd
Revises: ae09cec4659c
Create Date: 2026-02-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "3b5978b617fd"
down_revision: Union[str, Sequence[str], None] = "ae09cec4659c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
