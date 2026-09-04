"""add fonts and brand colors

Revision ID: a1b2c3d4e5f7
Revises: 067ba74387e2
Create Date: 2026-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, Sequence[str], None] = "067ba74387e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fonts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("header_font_family", sa.String(200), nullable=False),
        sa.Column("body_font_family", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("tenant_details", sa.Column("brand_color_background", sa.String(7), nullable=True))
    op.add_column("tenant_details", sa.Column("brand_color_foreground", sa.String(7), nullable=True))
    op.add_column("tenant_details", sa.Column("brand_color_muted", sa.String(7), nullable=True))
    op.add_column("tenant_details", sa.Column("font_id", sa.Integer(), nullable=True))
    op.create_foreign_key("tenant_details_font_id_fkey", "tenant_details", "fonts", ["font_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("tenant_details_font_id_fkey", "tenant_details", type_="foreignkey")
    op.drop_column("tenant_details", "font_id")
    op.drop_column("tenant_details", "brand_color_muted")
    op.drop_column("tenant_details", "brand_color_foreground")
    op.drop_column("tenant_details", "brand_color_background")
    op.drop_table("fonts")
