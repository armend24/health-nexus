"""add recommendation table

Revision ID: 7aff676701cb
Revises: 771215a9ea7c
Create Date: 2026-02-24 11:44:10.852629

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7aff676701cb'
down_revision: Union[str, Sequence[str], None] = '771215a9ea7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'recommendations',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('service_id', sa.Integer, nullable=False),
        sa.Column('report_id', sa.Integer, nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('recommendations')
