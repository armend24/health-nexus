"""add brand_themes table

Revision ID: d1e2f3a4b5c6
Revises: a1b2c3d4e5f7
Create Date: 2026-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "brand_themes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("brand_color_primary", sa.String(7), nullable=False),
        sa.Column("brand_color_secondary", sa.String(7), nullable=False),
        sa.Column("brand_color_background", sa.String(7), nullable=False),
        sa.Column("brand_color_foreground", sa.String(7), nullable=False),
        sa.Column("brand_color_muted", sa.String(7), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("brand_themes")
