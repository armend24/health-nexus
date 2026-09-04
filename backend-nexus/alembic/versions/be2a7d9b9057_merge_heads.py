"""merge_heads

Revision ID: be2a7d9b9057
Revises: c9d0e1f2a3b4, l6m7n8o9p0q1
Create Date: 2026-03-11 13:38:23.122684

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be2a7d9b9057'
down_revision: Union[str, Sequence[str], None] = ('c9d0e1f2a3b4', 'l6m7n8o9p0q1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
