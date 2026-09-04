"""merge multiple heads

Revision ID: cf0e6eb568d5
Revises: 5a42538a76fa, k5l6m7n8o9p0
Create Date: 2026-03-04 00:44:05.588787

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cf0e6eb568d5'
down_revision: Union[str, Sequence[str], None] = ('5a42538a76fa', 'k5l6m7n8o9p0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
