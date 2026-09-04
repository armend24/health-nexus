"""add enrollment status history enums

Revision ID: f3cef403cd17
Revises: facadd13a87e
Create Date: 2026-02-24 16:03:16.848706

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3cef403cd17'
down_revision: Union[str, Sequence[str], None] = 'facadd13a87e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    enrollment_status_enum = sa.Enum(
        "PENDING",
        "ACTIVE",
        "CANCELLED",
        "EXPIRED",
        name="enrollment_status_history_old"
    )

    enrollment_status_enum.create(op.get_bind(), checkfirst=True)

    enrollment_status_enum_new = sa.Enum(
        "PENDING",
        "ACTIVE",
        "CANCELLED",
        "EXPIRED",
        name="enrollment_status_history_new"
    )

    enrollment_status_enum_new.create(op.get_bind(), checkfirst=True)

    op.alter_column(
        "enrollment_status_history",
        "old_status",
        type_=enrollment_status_enum,
        postgresql_using="old_status::enrollment_status_history_old"
    )

    op.alter_column(
        "enrollment_status_history",
        "new_status",
        type_=enrollment_status_enum_new,
        postgresql_using="new_status::enrollment_status_history_new"
    )


def downgrade() -> None:
    sa.Enum(name="enrollment_status_history_old").drop(
        op.get_bind(),
        checkfirst=True
    )

    sa.Enum(name="enrollment_status_history_new").drop(
        op.get_bind(),
        checkfirst=True
    )