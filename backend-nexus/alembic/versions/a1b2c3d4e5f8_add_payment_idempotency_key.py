"""add payment idempotency_key and unique constraint

Revision ID: a1b2c3d4e5f8
Revises: c1d2e3f4a5b6
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f8"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("idempotency_key", sa.Text(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_payment_idempotency",
        "payments",
        ["tenant_id", "payment_type", "reference_id", "idempotency_key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_payment_idempotency", "payments", type_="unique")
    op.drop_column("payments", "idempotency_key")
