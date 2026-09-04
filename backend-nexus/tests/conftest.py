import os
import tempfile
from pathlib import Path

import pytest

# Set STORAGE_ROOT before app import (pytest loads conftest before tests)
# Use a persistent temp dir so both app mount and save_signature use the same path
if "STORAGE_ROOT" not in os.environ:
    os.environ["STORAGE_ROOT"] = tempfile.mkdtemp()
from dotenv import load_dotenv
from sqlalchemy import MetaData

from app.models.base import Base
from app.db import engine, SessionLocal

# backend-nexus root (parent of tests/)
_root = Path(__file__).resolve().parents[1]
_env_local = _root / ".env.local"
_env_default = _root / ".env"

if _env_local.exists():
    load_dotenv(_env_local, override=True)
    _env_loaded = ".env.local"
else:
    load_dotenv(_env_default, override=True)
    _env_loaded = ".env"


# Import so all models register their tables with Base.metadata before drop/create.
import app.models  # noqa: F401


def _drop_all_tables():
    """Drop all tables in DB, including migration-created tables not in Base.metadata."""
    meta = MetaData()
    meta.reflect(bind=engine)
    meta.drop_all(bind=engine)


@pytest.fixture(scope="function", autouse=True)
def reset_database():
    """
    Run before each test: drop all tables then create all tables for a clean DB.
    Uses reflect+drop_all to clear migration-created tables (e.g. consultation_requests).
    After the test: dispose engine connections so no sessions stay open.
    """
    _drop_all_tables()
    Base.metadata.create_all(bind=engine)

    yield

    engine.dispose()


@pytest.fixture(scope="function")
def db_session():
    """
    Provide a DB session for the test; session is closed after the test.
    Use this fixture when a test needs database access.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="session")
def require_database_url():
    """Assert DATABASE_URL is set; message indicates which env file was loaded."""
    url = os.environ.get("DATABASE_URL")
    assert url, "DATABASE_URL must be set for tests (loaded from backend-nexus/%s)" % _env_loaded
    return url
