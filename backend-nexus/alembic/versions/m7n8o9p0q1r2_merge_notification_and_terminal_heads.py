"""merge notification and terminal heads

Revision ID: m7n8o9p0q1r2
Revises: be2a7d9b9057, c9e1f7a2b4d6
Create Date: 2026-03-12 13:15:00

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "m7n8o9p0q1r2"
down_revision: Union[str, Sequence[str], None] = (
    "be2a7d9b9057",
    "c9e1f7a2b4d6",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass