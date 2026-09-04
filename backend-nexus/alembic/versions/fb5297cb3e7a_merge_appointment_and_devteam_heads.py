"""merge_appointment_and_devteam_heads

Revision ID: fb5297cb3e7a
Revises: b7c8d9e0f1a2, j4k5l6m7n8o9
Create Date: 2026-03-02 19:07:19.149023

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fb5297cb3e7a'
down_revision: Union[str, Sequence[str], None] = ('b7c8d9e0f1a2', 'j4k5l6m7n8o9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
