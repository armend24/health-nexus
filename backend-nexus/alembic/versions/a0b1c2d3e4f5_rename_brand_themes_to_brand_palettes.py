"""Rename brand_themes to brand_palettes

Revision ID: a0b1c2d3e4f5
Revises: f9a8b7c6d5e4
Create Date: 2025-02-25

"""
from alembic import op


revision = "a0b1c2d3e4f5"
down_revision = "f9a8b7c6d5e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("fk_tenant_details_brand_id", "tenant_details", type_="foreignkey")
    op.rename_table("brand_themes", "brand_palettes")
    op.create_foreign_key(
        "fk_tenant_details_brand_id",
        "tenant_details",
        "brand_palettes",
        ["brand_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_tenant_details_brand_id", "tenant_details", type_="foreignkey")
    op.rename_table("brand_palettes", "brand_themes")
    op.create_foreign_key(
        "fk_tenant_details_brand_id",
        "tenant_details",
        "brand_themes",
        ["brand_id"],
        ["id"],
    )
