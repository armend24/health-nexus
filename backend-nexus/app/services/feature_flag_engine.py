"""
Feature Flag Engine
===================
Resolves whether a feature is enabled for a given tenant using this precedence:

  1. Tenant override  (feature_flags row where tenant_id matches)
  2. Plan default     (feature_flags row where plan_tier matches the tenant's active plan)
  3. Fallback         → False (deny)

All resolution is deterministic and performs at most two indexed DB lookups.
"""

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.feature_flag import FeatureFlag
from app.models.tenant_subscription import TenantSubscription, SubscriptionStatus
from app.models.subscription_plan import SubscriptionPlan

logger = logging.getLogger(__name__)


def _get_active_plan_tier(db: Session, tenant_id: int) -> Optional[str]:
    """Return the active subscription plan name (tier) for the given tenant, or None."""
    row = (
        db.query(TenantSubscription)
        .filter(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status == SubscriptionStatus.ACTIVE,
        )
        .order_by(TenantSubscription.id.desc())
        .first()
    )
    if row is None:
        return None
    plan: Optional[SubscriptionPlan] = row.subscription_plan
    if plan is None:
        return None
    # Normalize: lowercase, strip whitespace (e.g. "Pro " → "pro")
    return plan.name.strip().lower()


def resolve_flag(db: Session, tenant_id: int, feature_key: str) -> bool:
    """
    Resolve whether *feature_key* is enabled for *tenant_id*.

    Precedence:
      1. Tenant override row (tenant_id=tenant_id, feature_key=feature_key)
      2. Plan default row   (plan_tier=active_plan, tenant_id=NULL, feature_key=feature_key)
      3. Fallback           → False

    Logs every resolution for audit/observability.
    """
    # 1. Tenant override
    override: Optional[FeatureFlag] = (
        db.query(FeatureFlag)
        .filter(
            FeatureFlag.tenant_id == tenant_id,
            FeatureFlag.feature_key == feature_key,
        )
        .first()
    )
    if override is not None:
        _log(tenant_id, feature_key, override.enabled, source="tenant_override")
        return override.enabled

    # 2. Plan default
    plan_tier = _get_active_plan_tier(db, tenant_id)
    if plan_tier is not None:
        default: Optional[FeatureFlag] = (
            db.query(FeatureFlag)
            .filter(
                FeatureFlag.tenant_id.is_(None),
                FeatureFlag.plan_tier == plan_tier,
                FeatureFlag.feature_key == feature_key,
            )
            .first()
        )
        if default is not None:
            _log(
                tenant_id, feature_key, default.enabled, source="plan_default", plan_tier=plan_tier
            )
            return default.enabled

    # 3. Fallback — deny
    _log(tenant_id, feature_key, False, source="fallback")
    return False


def _log(
    tenant_id: int,
    feature_key: str,
    enabled: bool,
    *,
    source: str,
    plan_tier: Optional[str] = None,
) -> None:
    event = "feature_access_allowed" if enabled else "feature_access_denied"
    logger.info(
        "%s tenant_id=%s feature_key=%s source=%s plan_tier=%s",
        event,
        tenant_id,
        feature_key,
        source,
        plan_tier,
    )
