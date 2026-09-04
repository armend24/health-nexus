import os

from dotenv import load_dotenv

# Project root (same folder as alembic.ini / .env)
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Local file storage root (for uploads); swap for Azure later
_DEFAULT_STORAGE_ROOT = os.path.join(_project_root, "uploads")
_env_local = os.path.join(_project_root, ".env.local")
_env = os.path.join(_project_root, ".env")
# Prefer .env.local for local dev so repo .env can stay generic while each dev overrides with .env.local (often gitignored).
dotenv_path = _env_local if os.path.isfile(_env_local) else _env
load_dotenv(dotenv_path=dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required (e.g. postgresql+psycopg://user:pass@db:5432/name)"
    )


def get_storage_root() -> str:
    """Root directory for file storage (local disk). Override with STORAGE_ROOT env."""
    return os.getenv("STORAGE_ROOT") or _DEFAULT_STORAGE_ROOT


def get_api_base_url() -> str:
    """Base URL for API. Uses API_BASE_URL, or builds from API_HOST + API_PORT (default localhost:8000)."""
    url = os.getenv("API_BASE_URL")
    if url:
        return url.rstrip("/")
    host = os.getenv("API_HOST", "localhost")
    port = os.getenv("API_PORT", "8000")
    scheme = "https" if os.getenv("API_SCHEME") == "https" else "http"
    return f"{scheme}://{host}:{port}"


def get_deepseek_api_key() -> str | None:
    return os.getenv("DEEPSEEK_API_KEY")


def get_deepseek_model() -> str:
    return os.getenv("DEEPSEEK_MODEL", "deepseek-chat")


def get_stripe_secret_key() -> str | None:
    """Stripe secret API key used for PaymentIntent creation."""
    return os.getenv("STRIPE_SECRET_KEY")


def get_stripe_webhook_secret() -> str | None:
    """Stripe webhook signing secret used for signature verification."""
    return os.getenv("STRIPE_WEBHOOK_SECRET")


def get_stripe_currency() -> str:
    """Default checkout currency for Stripe PaymentIntent creation."""
    return (os.getenv("STRIPE_CURRENCY") or "usd").strip().lower()
