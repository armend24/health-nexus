"""add product image and category

Revision ID: l6m7n8o9p0q1
Revises: i3j4k5l6m7n8, k5l6m7n8o9p0
Create Date: 2026-03-11 14:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "l6m7n8o9p0q1"
down_revision = ("i3j4k5l6m7n8", "k5l6m7n8o9p0")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("category", sa.String(length=100), nullable=True))
    op.add_column("products", sa.Column("image_url", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "image_url")
    op.drop_column("products", "category")
