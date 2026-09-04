"""merge_sessions_and_tenantstatus

Revision ID: 329591dc823e
Revises: 56ebff7a35d0
Create Date: 2026-02-22 14:22:11.642590

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '329591dc823e'
down_revision: Union[str, Sequence[str], None] = '56ebff7a35d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
