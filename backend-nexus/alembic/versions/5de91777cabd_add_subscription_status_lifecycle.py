"""add subscription status lifecycle

Revision ID: 5de91777cabd
Revises: 7b5e793bcc1d
Create Date: 2026-02-24 15:17:25.312054

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5de91777cabd'
down_revision: Union[str, Sequence[str], None] = '7b5e793bcc1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create the enum type first
    op.execute("CREATE TYPE subscription_status AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED')")
    op.add_column('tenant_subscriptions', sa.Column('status', sa.Enum('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', name='subscription_status'), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    # Drop the column first, then the enum type
    op.drop_column('tenant_subscriptions', 'status')
    op.execute("DROP TYPE subscription_status")
