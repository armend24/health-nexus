"""merge_heads

Revision ID: 067ba74387e2
Revises: 64d659958a52, 8894f984316d
Create Date: 2026-02-24 23:53:31.545706

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '067ba74387e2'
down_revision: Union[str, Sequence[str], None] = ('64d659958a52', '8894f984316d')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
