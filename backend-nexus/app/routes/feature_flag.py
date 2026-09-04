"""
Feature Flag Routes
===================

Admin endpoints (super_admin only):
  POST   /api/superadmin/feature-flags/defaults          — create/update a plan-level default
  POST   /api/superadmin/feature-flags/overrides         — create/update a tenant override
  DELETE /api/superadmin/feature-flags/defaults/{id}     — remove a plan default
  DELETE /api/superadmin/feature-flags/overrides/{id}    — remove a tenant override
  GET    /api/superadmin/feature-flags                   — list all flags

Evaluate endpoint (any authenticated user):
  GET    /api/feature-flags/{feature_key}                — resolve flag for the caller's tenant
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user, require_role
from app.db import get_db
from app.lib.feature_flag_seed import SEED_FEATURE_FLAGS
from app.models.feature_flag import FeatureFlag
from app.models.tenant import Tenant
from app.services.feature_flag_engine import _get_active_plan_tier, resolve_flag

logger = logging.getLogger(__name__)

router = APIRouter(tags=["feature-flags"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PlanDefaultUpsert(BaseModel):
    plan_tier: str = Field(..., min_length=1, max_length=50)
    feature_key: str = Field(..., min_length=1, max_length=100)
    enabled: bool


class TenantOverrideUpsert(BaseModel):
    tenant_id: int
    feature_key: str = Field(..., min_length=1, max_length=100)
    enabled: bool


class FeatureFlagOut(BaseModel):
    id: int
    tenant_id: Optional[int]
    feature_key: str
    enabled: bool
    plan_tier: Optional[str]

    class Config:
        from_attributes = True


class FeatureFlagTenantOption(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class FlagEvalOut(BaseModel):
    feature_key: str
    enabled: bool
    tenant_id: int


# ---------------------------------------------------------------------------
# Admin — list all flags
# ---------------------------------------------------------------------------


@router.get(
    "/api/superadmin/feature-flags",
    response_model=List[FeatureFlagOut],
    dependencies=[Depends(require_role("SUPER_ADMIN"))],
)
def list_flags(
    tenant_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> List[FeatureFlag]:
    if tenant_id is not None:
        plan_tier = _get_active_plan_tier(db, tenant_id)
        query = db.query(FeatureFlag).filter(
            or_(
                FeatureFlag.tenant_id == tenant_id,
                (FeatureFlag.tenant_id.is_(None) & (FeatureFlag.plan_tier == plan_tier)),
            )
        )
        return query.order_by(FeatureFlag.plan_tier, FeatureFlag.feature_key).all()

    return db.query(FeatureFlag).order_by(FeatureFlag.plan_tier, FeatureFlag.feature_key).all()


@router.get(
    "/api/superadmin/feature-flags/tenants",
    response_model=List[FeatureFlagTenantOption],
    dependencies=[Depends(require_role("SUPER_ADMIN"))],
)
def list_feature_flag_tenants(db: Session = Depends(get_db)) -> List[Tenant]:
    return db.query(Tenant).order_by(Tenant.name.asc(), Tenant.id.asc()).all()


# ---------------------------------------------------------------------------
# Admin — reset flags to canonical seed values
# ---------------------------------------------------------------------------


@router.post(
    "/api/superadmin/feature-flags/reset",
    response_model=List[FeatureFlagOut],
    dependencies=[Depends(require_role("SUPER_ADMIN"))],
)
def reset_flags_to_seed(db: Session = Depends(get_db)) -> List[FeatureFlag]:
    """
    Reset all feature flags to canonical seed defaults.

    Behavior:
      - Delete all tenant overrides.
      - Remove plan defaults not present in seed config.
      - Upsert all seeded plan defaults with seeded enabled values.
    """
    seed_pairs: dict[tuple[str, str], bool] = {}
    for feature_key, tier_map in SEED_FEATURE_FLAGS.items():
        for plan_tier, enabled in tier_map.items():
            seed_pairs[(plan_tier.strip().lower(), feature_key)] = enabled

    existing_defaults = db.query(FeatureFlag).filter(FeatureFlag.tenant_id.is_(None)).all()
    existing_by_pair: dict[tuple[str, str], FeatureFlag] = {}

    for row in existing_defaults:
        if row.plan_tier is None:
            db.delete(row)
            continue
        key = (row.plan_tier.strip().lower(), row.feature_key)
        if key in seed_pairs:
            existing_by_pair[key] = row
        else:
            db.delete(row)

    for (plan_tier, feature_key), enabled in seed_pairs.items():
        existing = existing_by_pair.get((plan_tier, feature_key))
        if existing:
            existing.enabled = enabled
            continue

        db.add(
            FeatureFlag(
                tenant_id=None,
                plan_tier=plan_tier,
                feature_key=feature_key,
                enabled=enabled,
            )
        )

    (
        db.query(FeatureFlag)
        .filter(FeatureFlag.tenant_id.isnot(None))
        .delete(synchronize_session=False)
    )

    db.commit()

    return (
        db.query(FeatureFlag)
        .filter(FeatureFlag.tenant_id.is_(None))
        .order_by(FeatureFlag.plan_tier, FeatureFlag.feature_key)
        .all()
    )


# ---------------------------------------------------------------------------
# Admin — plan-level defaults
# ---------------------------------------------------------------------------


@router.post(
    "/api/superadmin/feature-flags/defaults",
    response_model=FeatureFlagOut,
    dependencies=[Depends(require_role("SUPER_ADMIN"))],
)
def upsert_plan_default(body: PlanDefaultUpsert, db: Session = Depends(get_db)) -> FeatureFlag:
    """Create or update a plan-level default flag."""
    existing = (
        db.query(FeatureFlag)
        .filter(
            FeatureFlag.tenant_id.is_(None),
            FeatureFlag.plan_tier == body.plan_tier.strip().lower(),
            FeatureFlag.feature_key == body.feature_key,
        )
        .first()
    )
    if existing:
        existing.enabled = body.enabled
        db.commit()
        db.refresh(existing)
        return existing

    flag = FeatureFlag(
        tenant_id=None,
        plan_tier=body.plan_tier.strip().lower(),
        feature_key=body.feature_key,
        enabled=body.enabled,
    )
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return flag


@router.delete(
    "/api/superadmin/feature-flags/defaults/{flag_id}",
    status_code=204,
    dependencies=[Depends(require_role("SUPER_ADMIN"))],
)
def delete_plan_default(flag_id: int, db: Session = Depends(get_db)) -> None:
    flag = (
        db.query(FeatureFlag)
        .filter(
            FeatureFlag.id == flag_id,
            FeatureFlag.tenant_id.is_(None),
        )
        .first()
    )
    if flag is None:
        raise HTTPException(status_code=404, detail="Plan default not found")
    db.delete(flag)
    db.commit()


# ---------------------------------------------------------------------------
# Admin — tenant overrides
# ---------------------------------------------------------------------------


@router.post(
    "/api/superadmin/feature-flags/overrides",
    response_model=FeatureFlagOut,
    dependencies=[Depends(require_role("SUPER_ADMIN"))],
)
def upsert_tenant_override(
    body: TenantOverrideUpsert, db: Session = Depends(get_db)
) -> FeatureFlag:
    """Create or update a per-tenant feature flag override."""
    tenant = db.query(Tenant).filter(Tenant.id == body.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    existing = (
        db.query(FeatureFlag)
        .filter(
            FeatureFlag.tenant_id == body.tenant_id,
            FeatureFlag.feature_key == body.feature_key,
        )
        .first()
    )
    if existing:
        existing.enabled = body.enabled
        db.commit()
        db.refresh(existing)
        return existing

    flag = FeatureFlag(
        tenant_id=body.tenant_id,
        plan_tier=None,
        feature_key=body.feature_key,
        enabled=body.enabled,
    )
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return flag


@router.delete(
    "/api/superadmin/feature-flags/overrides/{flag_id}",
    status_code=204,
    dependencies=[Depends(require_role("SUPER_ADMIN"))],
)
def delete_tenant_override(flag_id: int, db: Session = Depends(get_db)) -> None:
    flag = (
        db.query(FeatureFlag)
        .filter(
            FeatureFlag.id == flag_id,
            FeatureFlag.tenant_id.isnot(None),
        )
        .first()
    )
    if flag is None:
        raise HTTPException(status_code=404, detail="Tenant override not found")
    db.delete(flag)
    db.commit()


# ---------------------------------------------------------------------------
# Evaluate — any authenticated user resolves a flag for their own tenant
# ---------------------------------------------------------------------------


@router.get(
    "/api/feature-flags/{feature_key}",
    response_model=FlagEvalOut,
)
def evaluate_flag(
    feature_key: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FlagEvalOut:
    """
    Resolve *feature_key* for the calling user's tenant.
    Returns ``{"feature_key": "...", "enabled": true/false, "tenant_id": ...}``.
    Does NOT raise 403 — access denial is expressed via ``enabled: false``.
    The caller decides what to do with the result.
    """
    tenant_id_raw = user.get("tenant_id")
    if tenant_id_raw is None:
        raise HTTPException(status_code=403, detail="No tenant associated with this account")
    try:
        tenant_id = int(tenant_id_raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="No tenant associated with this account")

    enabled = resolve_flag(db, tenant_id, feature_key)
    return FlagEvalOut(feature_key=feature_key, enabled=enabled, tenant_id=tenant_id)


# ---------------------------------------------------------------------------
# Guard dependency — use in other routes to gate access behind a feature flag
# ---------------------------------------------------------------------------


def require_feature(feature_key: str):
    """
    FastAPI dependency factory.  Raises 403 if the feature is not enabled for
    the calling user's tenant.

    Usage::

        @router.get("/my-route", dependencies=[Depends(require_feature("telemedicine"))])
        def my_route():
            ...
    """

    def dependency(
        user: Dict[str, Any] = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> None:
        tenant_id_raw = user.get("tenant_id")
        if tenant_id_raw is None:
            logger.warning(
                "feature_access_denied feature_key=%s reason=no_tenant user_id=%s",
                feature_key,
                user.get("user_id"),
            )
            raise HTTPException(status_code=403, detail="Feature not available")

        try:
            tenant_id = int(tenant_id_raw)
        except (TypeError, ValueError):
            logger.warning(
                "feature_access_denied feature_key=%s reason=invalid_tenant user_id=%s",
                feature_key,
                user.get("user_id"),
            )
            raise HTTPException(status_code=403, detail="Feature not available")
        enabled = resolve_flag(db, tenant_id, feature_key)
        if not enabled:
            raise HTTPException(
                status_code=403, detail=f"Feature '{feature_key}' is not enabled for your plan"
            )

    return dependency
