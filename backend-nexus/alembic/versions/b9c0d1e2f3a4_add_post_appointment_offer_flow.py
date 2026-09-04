"""add post appointment offer flow tables

Revision ID: b9c0d1e2f3a4
Revises: a1f2e3d4c5b6
Create Date: 2026-03-10 02:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "a1f2e3d4c5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


offer_delivery_status = postgresql.ENUM(
    "PENDING",
    "DELIVERED",
    "VIEWED",
    "ACCEPTED",
    "DECLINED",
    "EXPIRED",
    name="offer_delivery_status",
    create_type=True,
)
offer_delivery_channel = postgresql.ENUM(
    "EMAIL",
    "IN_APP",
    "DASHBOARD",
    name="offer_delivery_channel",
    create_type=True,
)


def upgrade() -> None:
    bind = op.get_bind()

    op.execute("DROP TABLE IF EXISTS offer_acceptance")
    op.execute("DROP TABLE IF EXISTS offer_deliveries")
    op.execute("DROP TABLE IF EXISTS recommendations")

    offer_delivery_status.create(bind, checkfirst=True)
    offer_delivery_channel.create(bind, checkfirst=True)

    op.create_table(
        "recommendations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("appointment_id", sa.Integer(), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column("recommendation_type", sa.String(length=100), nullable=False),
        sa.Column("approved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"]),
        sa.ForeignKeyConstraint(["doctor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["client_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "appointment_id",
            "category",
            "recommendation_type",
            name="uq_recommendation_appointment_category_type",
        ),
    )
    op.create_index(op.f("ix_recommendations_category"), "recommendations", ["category"], unique=False)

    op.create_table(
        "offer_deliveries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recommendation_id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column(
            "offer_status",
            postgresql.ENUM(
                "PENDING",
                "DELIVERED",
                "VIEWED",
                "ACCEPTED",
                "DECLINED",
                "EXPIRED",
                name="offer_delivery_status",
                create_type=False,
            ),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column(
            "delivery_channel",
            postgresql.ENUM(
                "EMAIL",
                "IN_APP",
                "DASHBOARD",
                name="offer_delivery_channel",
                create_type=False,
            ),
            nullable=False,
            server_default="IN_APP",
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["client_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["recommendation_id"], ["recommendations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "recommendation_id",
            "client_id",
            name="uq_offer_delivery_recommendation",
        ),
    )
    op.create_index(
        op.f("ix_offer_deliveries_client_id"),
        "offer_deliveries",
        ["client_id"],
        unique=False,
    )

    op.create_table(
        "offer_acceptance",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("offer_delivery_id", sa.Integer(), nullable=False),
        sa.Column(
            "accepted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("redemption_method", sa.String(length=100), nullable=True),
        sa.Column("transaction_id", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["offer_delivery_id"], ["offer_deliveries.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("offer_delivery_id", name="uq_offer_acceptance_delivery"),
    )
    op.execute(
        "ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'OFFER_DELIVERED'"
    )


def downgrade() -> None:
    op.drop_table("offer_acceptance")
    op.drop_index(op.f("ix_offer_deliveries_client_id"), table_name="offer_deliveries")
    op.drop_table("offer_deliveries")
    op.drop_index(op.f("ix_recommendations_category"), table_name="recommendations")
    op.drop_table("recommendations")
    offer_delivery_channel.drop(op.get_bind(), checkfirst=True)
    offer_delivery_status.drop(op.get_bind(), checkfirst=True)
