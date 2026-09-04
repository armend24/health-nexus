"""merge heads: i3j4k5l6m7n8 (drop_font_key) and 6b503c0133b7 (tenant_scoped_patient_identity)

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8, 6b503c0133b7
Create Date: 2026-03-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "j4k5l6m7n8o9"
down_revision: Union[str, Sequence[str], None] = ("i3j4k5l6m7n8", "6b503c0133b7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
