"""Drop font_key column and fontkey enum from tenant_details

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa

revision = "i3j4k5l6m7n8"
down_revision = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("tenant_details", "font_key")
    op.execute("DROP TYPE IF EXISTS fontkey")


def downgrade() -> None:
    op.execute("CREATE TYPE fontkey AS ENUM ('f1', 'f2', 'f3', 'f4', 'f5')")
    op.add_column(
        "tenant_details",
        sa.Column("font_key", sa.Enum("f1", "f2", "f3", "f4", "f5", name="fontkey"), nullable=True),
    )
