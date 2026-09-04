"""add feature_flags table

Revision ID: a1f2e3d4c5b6
Revises: c1d2e3f4a5b6
Create Date: 2026-03-05

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1f2e3d4c5b6"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feature_flags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        # NULL = plan-level default; non-NULL = tenant override
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=True),
        sa.Column("feature_key", sa.String(100), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        # Plan tier this default applies to (e.g. "free", "pro"); NULL for tenant overrides
        sa.Column("plan_tier", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "feature_key", name="uq_feature_flag_tenant_key"),
    )
    op.create_index(
        "ix_feature_flag_plan_tier_key",
        "feature_flags",
        ["plan_tier", "feature_key"],
    )
    op.create_index(
        "ix_feature_flags_tenant_id",
        "feature_flags",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_feature_flags_tenant_id", table_name="feature_flags")
    op.drop_index("ix_feature_flag_plan_tier_key", table_name="feature_flags")
    op.drop_table("feature_flags")
