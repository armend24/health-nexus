"""update sales workflow models

Revision ID: eb76b54cb0a0
Revises: c1d2e3f4a5b6
Create Date: 2026-03-08 21:25:02.962027

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'eb76b54cb0a0'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    NOTE: This migration assumes the leads, lead_status_history, and consultation_bookings
    tables are empty. Enum value replacements, NOT NULL additions, and column drops are not
    safe against non-empty tables without data migration steps.
    """

    # -- 1. Replace lead_status enum with finalized pipeline stages --
    # Removes: DEMO_SCHEDULED, DEMO_COMPLETED, HIGH_INTEREST, NEGOTIATION
    # Adds: QUALIFIED, CONSULTATION_SCHEDULED, CONSULTATION_COMPLETED, AWAITING_DECISION, LOST
    # NOTE: Fails if any existing rows contain removed enum values.
    op.execute("ALTER TYPE lead_status RENAME TO lead_status_old")
    op.execute(
        "CREATE TYPE lead_status AS ENUM ("
        "'NEW', 'QUALIFIED', 'CONTACTED', 'CONSULTATION_SCHEDULED', "
        "'CONSULTATION_COMPLETED', 'AWAITING_DECISION', "
        "'CONVERTED', 'REJECTED', 'LOST')"
    )
    op.execute(
        "ALTER TABLE leads "
        "ALTER COLUMN status TYPE lead_status USING status::text::lead_status"
    )
    op.execute(
        "ALTER TABLE lead_status_history "
        "ALTER COLUMN old_status TYPE lead_status USING old_status::text::lead_status"
    )
    op.execute(
        "ALTER TABLE lead_status_history "
        "ALTER COLUMN new_status TYPE lead_status USING new_status::text::lead_status"
    )
    op.execute("DROP TYPE lead_status_old")

    # -- 2. Create cancelled_by_actor enum (LEAD | SALES) --
    op.execute("CREATE TYPE cancelled_by_actor AS ENUM ('LEAD', 'SALES')")

    # -- 3. Leads table --
    # Add as nullable+default first so existing rows don't violate NOT NULL,
    # then backfill and tighten the constraint.
    op.add_column('leads', sa.Column('licence_number', sa.String(255), nullable=True, server_default=''))
    op.execute("UPDATE leads SET licence_number = '' WHERE licence_number IS NULL")
    op.alter_column('leads', 'licence_number', nullable=False, server_default=None)
    op.add_column('leads', sa.Column('initial_message', sa.Text(), nullable=True))
    op.add_column('leads', sa.Column('next_action', sa.Text(), nullable=True))
    op.add_column('leads', sa.Column('next_action_due_at', sa.DateTime(timezone=True), nullable=True))
    op.alter_column('leads', 'organization_name',
                     existing_type=sa.VARCHAR(length=255), nullable=False)
    op.alter_column('leads', 'contact_name',
                     existing_type=sa.VARCHAR(length=255), nullable=False)
    op.alter_column('leads', 'contact_email',
                     existing_type=sa.VARCHAR(length=255), nullable=False)
    op.drop_column('leads', 'notes')

    # -- 4. Lead status history --
    op.add_column('lead_status_history', sa.Column('reason', sa.Text(), nullable=True))
    op.alter_column('lead_status_history', 'old_status',
                     existing_type=postgresql.ENUM(name='lead_status'),
                     nullable=False)
    op.alter_column('lead_status_history', 'changed_by_user_id',
                     existing_type=sa.INTEGER(), nullable=False)

    # -- 5. Consultation bookings --
    op.add_column('consultation_bookings', sa.Column(
        'cancelled_by_actor',
        postgresql.ENUM('LEAD', 'SALES', name='cancelled_by_actor', create_type=False),
        nullable=True,
    ))
    op.add_column('consultation_bookings', sa.Column('cancellation_reason', sa.Text(), nullable=True))
    op.alter_column('consultation_bookings', 'scheduled_at',
                     existing_type=postgresql.TIMESTAMP(timezone=True), nullable=False)
    op.alter_column('consultation_bookings', 'duration_minutes',
                     existing_type=sa.INTEGER(), nullable=False)
    op.alter_column('consultation_bookings', 'created_by_user_id',
                     existing_type=sa.INTEGER(), nullable=False)
    op.alter_column('consultation_bookings', 'created_at',
                     existing_type=postgresql.TIMESTAMP(timezone=True),
                     nullable=False,
                     existing_server_default=sa.text('now()'))
    op.drop_column('consultation_bookings', 'updated_at')


def downgrade() -> None:
    """Downgrade schema."""

    # -- 5. Revert consultation_bookings --
    op.add_column('consultation_bookings', sa.Column(
        'updated_at', postgresql.TIMESTAMP(timezone=True),
        server_default=sa.text('now()'), nullable=False,
    ))
    op.alter_column('consultation_bookings', 'created_at',
                     existing_type=postgresql.TIMESTAMP(timezone=True),
                     nullable=True,
                     existing_server_default=sa.text('now()'))
    op.alter_column('consultation_bookings', 'created_by_user_id',
                     existing_type=sa.INTEGER(), nullable=True)
    op.alter_column('consultation_bookings', 'duration_minutes',
                     existing_type=sa.INTEGER(), nullable=True)
    op.alter_column('consultation_bookings', 'scheduled_at',
                     existing_type=postgresql.TIMESTAMP(timezone=True), nullable=True)
    op.drop_column('consultation_bookings', 'cancellation_reason')
    op.drop_column('consultation_bookings', 'cancelled_by_actor')

    # -- 4. Revert lead_status_history --
    op.alter_column('lead_status_history', 'changed_by_user_id',
                     existing_type=sa.INTEGER(), nullable=True)
    op.alter_column('lead_status_history', 'old_status',
                     existing_type=postgresql.ENUM(name='lead_status'),
                     nullable=True)
    op.drop_column('lead_status_history', 'reason')

    # -- 3. Revert leads --
    op.add_column('leads', sa.Column('notes', sa.TEXT(), nullable=True))
    op.alter_column('leads', 'contact_email',
                     existing_type=sa.VARCHAR(length=255), nullable=True)
    op.alter_column('leads', 'contact_name',
                     existing_type=sa.VARCHAR(length=255), nullable=True)
    op.alter_column('leads', 'organization_name',
                     existing_type=sa.VARCHAR(length=255), nullable=True)
    op.drop_column('leads', 'next_action_due_at')
    op.drop_column('leads', 'next_action')
    op.drop_column('leads', 'initial_message')
    op.drop_column('leads', 'licence_number')

    # -- 2. Drop cancelled_by_actor enum --
    op.execute("DROP TYPE cancelled_by_actor")

    # -- 1. Revert lead_status enum to original values --
    op.execute("ALTER TYPE lead_status RENAME TO lead_status_new")
    op.execute(
        "CREATE TYPE lead_status AS ENUM ("
        "'NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', "
        "'HIGH_INTEREST', 'NEGOTIATION', 'CONVERTED', 'REJECTED')"
    )
    op.execute(
        "ALTER TABLE leads "
        "ALTER COLUMN status TYPE lead_status USING status::text::lead_status"
    )
    op.execute(
        "ALTER TABLE lead_status_history "
        "ALTER COLUMN old_status TYPE lead_status USING old_status::text::lead_status"
    )
    op.execute(
        "ALTER TABLE lead_status_history "
        "ALTER COLUMN new_status TYPE lead_status USING new_status::text::lead_status"
    )
    op.execute("DROP TYPE lead_status_new")
