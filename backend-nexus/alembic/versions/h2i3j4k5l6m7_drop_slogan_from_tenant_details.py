"""Drop slogan column from tenant_details

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa

revision = "h2i3j4k5l6m7"
down_revision = "g1h2i3j4k5l6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("tenant_details", "slogan")


def downgrade() -> None:
    op.add_column(
        "tenant_details",
        sa.Column("slogan", sa.String(length=255), nullable=True),
    )
