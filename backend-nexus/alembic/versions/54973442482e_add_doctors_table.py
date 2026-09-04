"""add doctors table

Revision ID: 54973442482e
Revises: b2381d57574f
Create Date: 2026-02-24 01:48:03.034293

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '54973442482e'
down_revision: Union[str, Sequence[str], None] = 'b2381d57574f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
