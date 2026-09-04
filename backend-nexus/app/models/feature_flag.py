from sqlalchemy import String, Boolean, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class FeatureFlag(Base, TimestampMixin):
    """
    Stores both plan-level defaults and per-tenant overrides.

    - Plan default:   tenant_id=NULL, plan_tier="pro",  feature_key="advanced_reports"
    - Tenant override: tenant_id=7,   plan_tier=NULL,   feature_key="advanced_reports"

    Resolution order (in engine): tenant override → plan default → False.
    """

    __tablename__ = "feature_flags"

    id: Mapped[int] = mapped_column(primary_key=True)

    # NULL means this row is a plan-level default, not a tenant override
    tenant_id: Mapped[int | None] = mapped_column(nullable=True)

    # e.g. "advanced_reports", "telemedicine", "bulk_export"
    feature_key: Mapped[str] = mapped_column(String(100), nullable=False)

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # The subscription plan tier this default applies to (e.g. "free", "pro", "enterprise")
    # NULL for tenant overrides (they are not tied to a specific plan tier)
    plan_tier: Mapped[str | None] = mapped_column(String(50), nullable=True)

    __table_args__ = (
        # One override per (tenant, feature)
        UniqueConstraint(
            "tenant_id",
            "feature_key",
            name="uq_feature_flag_tenant_key",
        ),
        # One default per (plan_tier, feature) — partial uniqueness enforced at app level
        # for NULL tenant_id rows (SQL UNIQUE allows multiple NULLs, so we use an index)
        Index(
            "ix_feature_flag_plan_tier_key",
            "plan_tier",
            "feature_key",
        ),
    )
