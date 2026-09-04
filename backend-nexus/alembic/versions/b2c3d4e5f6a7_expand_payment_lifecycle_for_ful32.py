"""expand payment lifecycle for FUL-32

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f8
Create Date: 2026-03-08

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_PAYMENT_STATUS = (
    "INITIATED",
    "AUTHORIZED",
    "CAPTURED",
    "FAILED",
    "REFUNDED",
)

NEW_PAYMENT_STATUS = OLD_PAYMENT_STATUS + (
    "CANCELED",
    "DISPUTED",
    "REQUIRES_MANUAL_INTERVENTION",
)


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    if _is_postgresql():
        for value in ("CANCELED", "DISPUTED", "REQUIRES_MANUAL_INTERVENTION"):
            bind.execute(sa.text(f"ALTER TYPE payment_status ADD VALUE IF NOT EXISTS '{value}'"))

    op.add_column("payments", sa.Column("external_event_id", sa.Text(), nullable=True))
    op.add_column(
        "payments",
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("payments", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column("payments", sa.Column("audit_notes", sa.Text(), nullable=True))
    op.alter_column("payments", "retry_count", server_default=None)

    if not _is_postgresql():
        op.alter_column(
            "payments",
            "status",
            existing_type=sa.Enum(*OLD_PAYMENT_STATUS, name="payment_status"),
            type_=sa.Enum(*NEW_PAYMENT_STATUS, name="payment_status"),
            existing_nullable=False,
        )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()

    op.drop_column("payments", "audit_notes")
    op.drop_column("payments", "last_error")
    op.drop_column("payments", "retry_count")
    op.drop_column("payments", "external_event_id")

    bind.execute(
        sa.text(
            """
            UPDATE payments
            SET status = CASE
                WHEN status = 'CANCELED' THEN 'FAILED'
                WHEN status = 'DISPUTED' THEN 'FAILED'
                WHEN status = 'REQUIRES_MANUAL_INTERVENTION' THEN 'FAILED'
                ELSE status
            END
            """
        )
    )

    if _is_postgresql():
        op.execute("ALTER TYPE payment_status RENAME TO payment_status_old")
        sa.Enum(*OLD_PAYMENT_STATUS, name="payment_status").create(bind, checkfirst=False)
        op.execute(
            """
            ALTER TABLE payments
            ALTER COLUMN status TYPE payment_status
            USING status::text::payment_status
            """
        )
        op.execute("DROP TYPE payment_status_old")
    else:
        op.alter_column(
            "payments",
            "status",
            existing_type=sa.Enum(*NEW_PAYMENT_STATUS, name="payment_status"),
            type_=sa.Enum(*OLD_PAYMENT_STATUS, name="payment_status"),
            existing_nullable=False,
        )
