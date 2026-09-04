"""add tenant subscription notification type

Revision ID: c9e1f7a2b4d6
Revises: b2c3d4e5f6a7
Create Date: 2026-03-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9e1f7a2b4d6"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_NOTIFICATION_TYPES = (
    "APPOINTMENT_CREATED",
    "APPOINTMENT_CONFIRMED",
    "APPOINTMENT_REJECTED",
    "APPOINTMENT_CANCELLED",
    "APPOINTMENT_RESCHEDULED",
    "APPOINTMENT_COMPLETED",
)

NEW_NOTIFICATION_TYPES = OLD_NOTIFICATION_TYPES + (
    "TENANT_SUBSCRIPTION_CANCELLED",
)


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    bind = op.get_bind()

    if _is_postgresql():
        bind.execute(
            sa.text(
                "ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'TENANT_SUBSCRIPTION_CANCELLED'"
            )
        )
        return

    op.alter_column(
        "notifications",
        "type",
        existing_type=sa.Enum(*OLD_NOTIFICATION_TYPES, name="notificationtype"),
        type_=sa.Enum(*NEW_NOTIFICATION_TYPES, name="notificationtype"),
        existing_nullable=False,
    )


def downgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            """
            UPDATE notifications
            SET type = 'APPOINTMENT_CANCELLED'
            WHERE type = 'TENANT_SUBSCRIPTION_CANCELLED'
            """
        )
    )

    if _is_postgresql():
        op.execute("ALTER TYPE notificationtype RENAME TO notificationtype_old")
        sa.Enum(*OLD_NOTIFICATION_TYPES, name="notificationtype").create(bind, checkfirst=False)
        op.execute(
            """
            ALTER TABLE notifications
            ALTER COLUMN type TYPE notificationtype
            USING type::text::notificationtype
            """
        )
        op.execute("DROP TYPE notificationtype_old")
        return

    op.alter_column(
        "notifications",
        "type",
        existing_type=sa.Enum(*NEW_NOTIFICATION_TYPES, name="notificationtype"),
        type_=sa.Enum(*OLD_NOTIFICATION_TYPES, name="notificationtype"),
        existing_nullable=False,
    )