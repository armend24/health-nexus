"""add notifications table

Revision ID: b7c8d9e0f1a2
Revises: 8f1d2a4b9c3e
Create Date: 2026-02-27

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "8f1d2a4b9c3e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Enum values must match NotificationType in the model
notification_type_enum = sa.Enum(
    "APPOINTMENT_CREATED",
    "APPOINTMENT_CONFIRMED",
    "APPOINTMENT_REJECTED",
    "APPOINTMENT_CANCELLED",
    "APPOINTMENT_RESCHEDULED",
    "APPOINTMENT_COMPLETED",
    name="notificationtype",
)


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False
        ),
        sa.Column("type", notification_type_enum, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "is_read", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
    notification_type_enum.drop(op.get_bind(), checkfirst=True)
