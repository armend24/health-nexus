"""add product_templates table and product_template_id on products

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_templates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("default_price", sa.DECIMAL(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_product_templates_name"), "product_templates", ["name"], unique=False)
    op.add_column("products", sa.Column("product_template_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "products_product_template_id_fkey",
        "products",
        "product_templates",
        ["product_template_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("products_product_template_id_fkey", "products", type_="foreignkey")
    op.drop_column("products", "product_template_id")
    op.drop_index(op.f("ix_product_templates_name"), table_name="product_templates")
    op.drop_table("product_templates")
