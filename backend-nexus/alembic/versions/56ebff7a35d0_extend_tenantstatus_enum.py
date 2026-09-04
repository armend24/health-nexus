"""extend tenantstatus enum
RUN THIS FILE IF YOU ARE HAVING ISSUE WITH STATUS ENUM IN TENANT TABLE
Revision ID: 56ebff7a35d0
Revises: 88462ee28a56
Create Date: 2026-02-22 02:01:13.585144

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '56ebff7a35d0'
down_revision: Union[str, Sequence[str], None] = '88462ee28a56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE tenantstatus ADD VALUE IF NOT EXISTS 'suspended'")
    op.execute("ALTER TYPE tenantstatus ADD VALUE IF NOT EXISTS 'archived'")



def downgrade() -> None:
    """Downgrade schema."""
    pass
