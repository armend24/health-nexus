"""merge feature flags and payment heads

Revision ID: d4e5f6a7b8c9
Revises: a1f2e3d4c5b6, b2c3d4e5f6a7
Create Date: 2026-03-10

"""

from typing import Sequence, Union


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = (
    "a1f2e3d4c5b6",
    "b2c3d4e5f6a7",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass