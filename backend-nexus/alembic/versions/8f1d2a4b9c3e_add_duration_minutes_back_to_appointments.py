"""add duration_minutes back to appointments

Revision ID: 8f1d2a4b9c3e
Revises: 31c57f34f7d7
Create Date: 2026-02-26 22:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8f1d2a4b9c3e"
down_revision: Union[str, Sequence[str], None] = "31c57f34f7d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {column["name"] for column in inspector.get_columns("appointments")}
    if "duration_minutes" not in column_names:
        op.add_column(
            "appointments",
            sa.Column(
                "duration_minutes",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("30"),
            ),
        )
        op.alter_column("appointments", "duration_minutes", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {column["name"] for column in inspector.get_columns("appointments")}
    if "duration_minutes" in column_names:
        op.drop_column("appointments", "duration_minutes")
