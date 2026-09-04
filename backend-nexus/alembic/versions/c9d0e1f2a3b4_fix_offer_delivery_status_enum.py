"""fix offer delivery status enum values

Revision ID: c9d0e1f2a3b4
Revises: b9c0d1e2f3a4
Create Date: 2026-03-11 11:20:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    with op.get_context().autocommit_block():
        bind.exec_driver_sql(
            "ALTER TYPE offer_delivery_status ADD VALUE IF NOT EXISTS 'DELIVERED'"
        )
        bind.exec_driver_sql(
            "ALTER TYPE offer_delivery_status ADD VALUE IF NOT EXISTS 'VIEWED'"
        )


def downgrade() -> None:
    # PostgreSQL enums cannot safely remove values in-place.
    pass
