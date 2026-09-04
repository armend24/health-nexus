"""Replace tenant_details brand color columns with brand_id FK

Revision ID: f9a8b7c6d5e4
Revises: e2f3a4b5c6d7
Create Date: 2025-02-25

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f9a8b7c6d5e4"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_details", sa.Column("brand_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tenant_details_brand_id",
        "tenant_details",
        "brand_themes",
        ["brand_id"],
        ["id"],
    )
    op.drop_column("tenant_details", "brand_color_primary")
    op.drop_column("tenant_details", "brand_color_secondary")
    op.drop_column("tenant_details", "brand_color_background")
    op.drop_column("tenant_details", "brand_color_foreground")
    op.drop_column("tenant_details", "brand_color_muted")


def downgrade() -> None:
    op.add_column("tenant_details", sa.Column("brand_color_primary", sa.String(7), nullable=True))
    op.add_column("tenant_details", sa.Column("brand_color_secondary", sa.String(7), nullable=True))
    op.add_column("tenant_details", sa.Column("brand_color_background", sa.String(7), nullable=True))
    op.add_column("tenant_details", sa.Column("brand_color_foreground", sa.String(7), nullable=True))
    op.add_column("tenant_details", sa.Column("brand_color_muted", sa.String(7), nullable=True))
    op.drop_constraint("fk_tenant_details_brand_id", "tenant_details", type_="foreignkey")
    op.drop_column("tenant_details", "brand_id")
