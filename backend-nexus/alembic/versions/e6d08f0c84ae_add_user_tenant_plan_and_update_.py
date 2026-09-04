"""add user tenant plan and update enrollments

Revision ID: e6d08f0c84ae
Revises: afb71725c1c6
Create Date: 2026-02-24 13:58:42.674076

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6d08f0c84ae'
down_revision: Union[str, Sequence[str], None] = 'afb71725c1c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    op.create_table(
        'user_tenant_plans',
        sa.Column('id', sa.Integer(), primary_key=True),

        sa.Column('tenant_id', sa.Integer(), nullable=False),

        sa.Column('name', sa.String(length=255), nullable=False),

        sa.Column('description', sa.Text(), nullable=True),

        sa.Column('price', sa.Numeric(10,2), nullable=False),

        sa.Column('duration', sa.Integer(), nullable=True),  # safer for SaaS

        sa.Column('max_appointments', sa.Integer(), nullable=True),
        sa.Column('max_consultations', sa.Integer(), nullable=True),

        sa.Column(
            'is_active',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('true')
        ),

        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False
        ),

        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            nullable=True
        ),

        sa.ForeignKeyConstraint(
            ['tenant_id'],
            ['tenants.id']
        )
    )

    op.add_column(
        'enrollments',
        sa.Column(
            'user_tenant_plan_id',
            sa.Integer(),
            nullable=False
        )
    )

    op.create_foreign_key(
        'enrollments_user_tenant_plan_id_fkey',
        'enrollments',
        'user_tenant_plans',
        ['user_tenant_plan_id'],
        ['id']
    )

    op.drop_column('enrollments', 'subscription_plan_id')

def downgrade() -> None:

    op.add_column(
        'enrollments',
        sa.Column(
            'subscription_plan_id',
            sa.INTEGER(),
            nullable=False
        )
    )

    op.drop_constraint(
        'enrollments_user_tenant_plan_id_fkey',
        'enrollments',
        type_='foreignkey'
    )

    op.drop_column('enrollments', 'user_tenant_plan_id')

    op.drop_table('user_tenant_plans')