import sys
import os
from pathlib import Path

from dotenv import load_dotenv

# Load env: .env.local first, then .env (override=False so existing vars are not overwritten)
_backend_root = Path(__file__).resolve().parent.parent
_env_local = _backend_root / ".env.local"
_env_file = _backend_root / ".env"
if _env_local.is_file():
    load_dotenv(_env_local, override=False)
if _env_file.is_file():
    load_dotenv(_env_file, override=False)

sys.path.insert(0, str(_backend_root))

# Prefer DATABASE_URL from env; fallback to alembic config
database_url = os.getenv("DATABASE_URL")

from sqlalchemy import engine_from_config, pool
from alembic import context

from app.models import Base

config = context.config
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)
else:
    database_url = config.get_main_option("sqlalchemy.url")

target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
