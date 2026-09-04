import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from fastapi import HTTPException

from app.auth.auth_schema import SignupRequest, SignupResponse, TokenResponse
from app.auth.auth_utils import (
    TokenError,
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_refresh_token,
)
from app.db import SessionLocal
from app.models import (
    Doctor,
    Enrollment,
    EnrollmentStatus,
    Patient,
    Role,
    Session,
    Tenant,
    TenantManager,
    User,
)

logger = logging.getLogger(__name__)

# Backward-compatible role name aliases (input after .upper() -> DB role name)
ROLE_NAME_ALIASES = {"ADMIN": "SUPER_ADMIN"}


def _resolve_user_tenant_id(session, user_id: int) -> int | None:
    """
    Resolve the tenant_id to embed in the JWT for a given user.

    Resolution order (first match wins):
      1. ACTIVE enrollment  — patients are directed to the tenant they're
                              actively enrolled in. This prevents landing on a
                              PENDING/EXPIRED enrollment tenant. Only patient
                              users have enrollment rows; doctors/managers/
                              admins fall straight through to step 2+.
      2. Patient profile    — any tenant_id from the patients table (fallback
                              for patients with no ACTIVE enrollment yet).
      3. Doctor profile     — doctors are resolved via the doctors table.
      4. Tenant manager     — managers are resolved via the tenant_managers table.
      5. None               — super-admins and roles with no scoped profile.

    # MERGE NOTE (feature/FUL-29 → dev-team-test-florent-prd04):
    # Step 1 was added to fix the booking flow: a patient with a PENDING
    # enrollment at tenant 1 and an ACTIVE enrollment at tenant 2 must receive
    # tenant_id=2 in the JWT so that checkEnrollment() passes on /appointments/book.
    # Steps 2-5 are unchanged from the dev-team implementation and affect no
    # dev-team users (doctors, managers, admins have zero enrollment rows).
    """
    # Step 1: Prefer the tenant where the patient has an ACTIVE enrollment.
    # Doctors, managers, and admins have no enrollment rows -> always skipped.
    active_enrollment_tenant = (
        session.execute(
            select(Enrollment.tenant_id)
            .where(
                Enrollment.patient_user_id == user_id,
                Enrollment.status == EnrollmentStatus.ACTIVE,
            )
            .order_by(Enrollment.tenant_id.asc())
        )
        .scalars()
        .first()
    )
    if active_enrollment_tenant is not None:
        return int(active_enrollment_tenant)

    # Step 2: Fall back to any patient profile row (covers patients with no
    # ACTIVE enrollment, e.g. still PENDING).
    patient_tenant = (
        session.execute(
            select(Patient.tenant_id)
            .where(Patient.user_id == user_id)
            .order_by(Patient.tenant_id.asc())
        )
        .scalars()
        .first()
    )
    if patient_tenant is not None:
        return int(patient_tenant)

    # Step 3: Doctor profile (dev-team path - unchanged).
    doctor_tenant = (
        session.execute(
            select(Doctor.tenant_id)
            .where(Doctor.user_id == user_id)
            .order_by(Doctor.tenant_id.asc())
        )
        .scalars()
        .first()
    )
    if doctor_tenant is not None:
        return int(doctor_tenant)

    # Step 4: Tenant manager profile (dev-team path - unchanged).
    manager_tenant = (
        session.execute(
            select(TenantManager.tenant_id)
            .where(TenantManager.user_id == user_id)
            .order_by(TenantManager.tenant_id.asc())
        )
        .scalars()
        .first()
    )
    if manager_tenant is not None:
        return int(manager_tenant)

    # Step 5: No scoped profile (e.g. SUPER_ADMIN) - token has no tenant_id.
    return None


def login_user(email: str, password: str) -> TokenResponse:
    """
    Authenticate a user by email and password.

    Returns a JWT access token on success. Raises HTTPException 401 if
    credentials are invalid.
    """
    session = SessionLocal()
    try:
        # Load user by email with role eagerly to avoid extra query
        stmt = select(User).where(User.email == email).options(joinedload(User.role))
        user = session.execute(stmt).scalar_one_or_none()
        if user is None:
            logger.warning("auth.login_failed user_not_found email=%s", email)
            raise HTTPException(status_code=401, detail="Invalid email or password")
        if not verify_password(password, user.password):
            logger.warning("auth.login_failed bad_password email=%s", email)
            raise HTTPException(status_code=401, detail="Invalid email or password")

        tenant_id = _resolve_user_tenant_id(session, user.id)
        payload = {
            "user_id": user.id,
            "email": user.email,
            "role": user.role.name,
        }
        if tenant_id is not None:
            payload["tenant_id"] = tenant_id
        token = create_access_token(data=payload)
        refresh_data = {"user_id": user.id, "email": user.email}
        if tenant_id is not None:
            refresh_data["tenant_id"] = tenant_id
        refresh_token = create_refresh_token(data=refresh_data)
        try:
            refresh_payload = verify_refresh_token(refresh_token)
        except TokenError:
            raise HTTPException(status_code=500, detail="Failed to issue refresh token")
        jti = refresh_payload.get("jti")
        exp = refresh_payload.get("exp")
        if jti is None or exp is None:
            raise HTTPException(status_code=500, detail="Failed to issue refresh token")
        db_session = Session(
            user_id=user.id,
            refresh_jti=jti,
            state="active",
            expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
            revoked_at=None,
        )
        session.add(db_session)
        session.commit()
        logger.info(
            "auth.login_success user_id=%s email=%s role=%s tenant_id=%s",
            user.id,
            user.email,
            user.role.name,
            tenant_id,
        )
        return TokenResponse(
            access_token=token,
            refresh_token=refresh_token,
            token_type="bearer",
        )
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def refresh_access_token(refresh_token: str) -> TokenResponse:
    """
    Issue a new access token from a valid refresh token with session state enforcement.
    """
    try:
        payload = verify_refresh_token(refresh_token)
    except TokenError:
        logger.warning("auth.refresh_denied invalid_token")
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    user_id = payload.get("user_id")
    jti = payload.get("jti")
    if user_id is None or jti is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    session = SessionLocal()
    try:
        stmt = select(Session).where(Session.refresh_jti == jti)
        db_session = session.execute(stmt).scalar_one_or_none()
        if db_session is None:
            logger.warning("auth.refresh_denied session_not_found jti=%s user_id=%s", jti, user_id)
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        if db_session.state != "active":
            logger.warning(
                "auth.refresh_denied session_state=%s jti=%s user_id=%s",
                db_session.state,
                jti,
                user_id,
            )
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        now = datetime.now(timezone.utc)
        if db_session.expires_at < now:
            db_session.state = "expired"
            session.commit()
            logger.warning(
                "auth.refresh_denied session_state=%s jti=%s user_id=%s",
                db_session.state,
                jti,
                user_id,
            )
            raise HTTPException(status_code=401, detail="Refresh token expired")
        user_stmt = select(User).where(User.id == user_id).options(joinedload(User.role))
        user = session.execute(user_stmt).scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        tenant_id = _resolve_user_tenant_id(session, user.id)
        new_payload = {"user_id": user.id, "email": user.email, "role": user.role.name}
        if tenant_id is not None:
            new_payload["tenant_id"] = tenant_id
        new_access = create_access_token(new_payload)
        logger.info("auth.refresh_success user_id=%s email=%s", user.id, user.email)
        return TokenResponse(access_token=new_access, token_type="bearer")
    except HTTPException:
        session.rollback()
        raise
    finally:
        session.close()


def logout_user(refresh_token: str) -> None:
    """
    Revoke the refresh session identified by the given refresh token.
    Idempotent: if the session is already revoked/expired, returns silently.
    """
    try:
        payload = verify_refresh_token(refresh_token)
    except TokenError:
        logger.warning("auth.logout_denied reason=%s jti=%s", "invalid_token", None)
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    jti = payload.get("jti")
    if jti is None:
        logger.warning("auth.logout_denied reason=%s jti=%s", "missing_jti", jti)
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    session = SessionLocal()
    try:
        stmt = select(Session).where(Session.refresh_jti == jti)
        db_session = session.execute(stmt).scalar_one_or_none()
        if db_session is None:
            logger.warning("auth.logout_denied reason=%s jti=%s", "session_not_found", jti)
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        if db_session.state != "active":
            logger.warning("auth.logout_denied reason=%s jti=%s", "session_not_active", jti)
            return
        db_session.state = "revoked"
        db_session.revoked_at = datetime.now(timezone.utc)
        session.commit()
        logger.info("auth.logout_success jti=%s user_id=%s", jti, db_session.user_id)
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def signup_user(body: SignupRequest) -> SignupResponse:
    """
    Create a global user account.

    Behavior:
    - Resolves role from the provided role name.
    - Creates a new user if email does not exist.
    - Returns 409 if the email is already registered.
    """
    session = SessionLocal()
    try:
        # Resolve role by name (normalized uppercase to match Roles table)
        role_name = (body.role or "client").strip().upper()
        role_name = ROLE_NAME_ALIASES.get(role_name, role_name)
        role = session.execute(select(Role).where(Role.name == role_name)).scalar_one_or_none()
        if role is None:
            logger.warning("auth.signup_role_not_found role=%s", role_name)
            raise HTTPException(status_code=404, detail="Role not found")

        # Find existing user by email (with role for response)
        user = session.execute(
            select(User).where(User.email == body.email).options(joinedload(User.role))
        ).scalar_one_or_none()

        if user is not None:
            logger.warning("auth.signup_duplicate email=%s", body.email)
            raise HTTPException(status_code=409, detail="User already exists")

        hashed = hash_password(body.password)
        new_user = User(
            email=body.email,
            password=hashed,
            first_name=body.first_name,
            last_name=body.last_name,
            role_id=role.id,
        )
        session.add(new_user)
        session.commit()
        session.refresh(new_user)
        logger.info(
            "auth.signup_success user_id=%s email=%s",
            new_user.id,
            new_user.email,
        )
        return SignupResponse(
            user_id=new_user.id,
            email=new_user.email,
            role=role.name,
        )
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
