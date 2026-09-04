#!/usr/bin/env sh
set -eu

# Extract DB host from DATABASE_URL (works for both local Docker and Azure)
export DB_HOST="$(
python - <<'END'
import os
import urllib.parse

url = os.getenv("DATABASE_URL", "").strip()

if url.startswith("postgresql+psycopg://"):
    url = url.replace("postgresql+psycopg://", "postgresql://", 1)

if url:
    parsed = urllib.parse.urlparse(url)
    print(parsed.hostname or "db")
else:
    print("db")
END
)"

echo "Waiting for database at $DB_HOST..."
python - <<'END'
import os
import socket
import time

host = os.environ.get("DB_HOST", "db")
port = 5432

while True:
    try:
        s = socket.create_connection((host, port), 2)
        s.close()
        break
    except OSError:
        time.sleep(1)
END

echo "Running migrations..."
NEEDS_STAMP="$(
python - <<'END'
import os
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

database_url = os.getenv("DATABASE_URL")
if not database_url:
    print("false")
    raise SystemExit(0)

engine = create_engine(database_url)

try:
    with engine.connect() as conn:
        has_roles = bool(
            conn.execute(text("SELECT to_regclass('public.roles') IS NOT NULL")).scalar()
        )
        has_alembic_version = bool(
            conn.execute(text("SELECT to_regclass('public.alembic_version') IS NOT NULL")).scalar()
        )
        print("true" if has_roles and not has_alembic_version else "false")
except SQLAlchemyError:
    print("false")
END
)"

if [ "$NEEDS_STAMP" = "true" ]; then
    echo "Existing schema detected without alembic history. Stamping head..."
    alembic stamp head
fi

MIGRATION_LOG="$(mktemp)"
if alembic upgrade head >"$MIGRATION_LOG" 2>&1; then
    cat "$MIGRATION_LOG"
else
    echo "Migration failed."
    cat "$MIGRATION_LOG"
    rm -f "$MIGRATION_LOG"
    exit 1
fi
rm -f "$MIGRATION_LOG"

SEED_ON_BOOT="${SEED_ON_BOOT:-true}"
if [ "$SEED_ON_BOOT" = "true" ]; then
    echo "Seeding baseline data..."
    python -m app.seed
fi

VERIFY_SEED_ON_BOOT="${VERIFY_SEED_ON_BOOT:-true}"
if [ "$VERIFY_SEED_ON_BOOT" = "true" ]; then
    echo "Verifying migration + seed baseline..."
    python -m app.verify_seed
fi

echo "Starting FastAPI..."
if [ "${UVICORN_RELOAD:-false}" = "true" ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi