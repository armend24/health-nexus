"""merge all heads after contracts and appointments

Revision ID: c1d2e3f4a5b6
Revises: cf0e6eb568d5, fb5297cb3e7a
Create Date: 2026-03-04

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = ("cf0e6eb568d5", "fb5297cb3e7a")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
