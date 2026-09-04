"""Add contracts table

Revision ID: a7b8c9d0e1f2
Revises: j4k5l6m7n8o9
Create Date: 2026-02-28

"""
from alembic import op
import sqlalchemy as sa

revision = "a7b8c9d0e1f2"
down_revision = "j4k5l6m7n8o9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contracts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("DRAFT", "ACTIVE", "EXPIRED", "TERMINATED", name="contract_status"),
            nullable=False,
        ),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("terms_metadata", sa.JSON(), nullable=True),
        sa.Column("terminated_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contracts_tenant_id", "contracts", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_contracts_tenant_id", table_name="contracts")
    op.drop_table("contracts")
    op.execute("DROP TYPE IF EXISTS contract_status")
