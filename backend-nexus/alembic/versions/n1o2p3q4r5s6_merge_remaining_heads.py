"""merge remaining heads

Revision ID: n1o2p3q4r5s6
Revises: m1n2o3p4q5r6, m7n8o9p0q1r2
Create Date: 2026-03-12 15:00:00.000000
"""

from typing import Sequence, Union


revision: str = "n1o2p3q4r5s6"
down_revision: Union[str, Sequence[str], None] = (
    "m1n2o3p4q5r6",
    "m7n8o9p0q1r2",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
