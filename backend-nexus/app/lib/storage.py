"""Storage abstraction for uploaded files. Local disk now; swap for Azure Blob later."""

import os
import uuid
from pathlib import Path
from typing import Literal

from app.config import get_storage_root

SignerRole = Literal["doctor", "hospital"]

# Subfolder for contract signatures
SIGNATURES_SUBDIR = "signatures"
TENANT_BRANDING_SUBDIR = "tenant-branding"


def _ext_from_content_type(content_type: str) -> str:
    """Map content-type to file extension."""
    ct = (content_type or "").split(";")[0].strip().lower()
    if "png" in ct:
        return "png"
    if "jpeg" in ct or "jpg" in ct:
        return "jpg"
    if "webp" in ct:
        return "webp"
    return "png"


def save_signature(contract_id: int, role: SignerRole, content: bytes, content_type: str) -> str:
    """
    Save signature image to storage. Returns a storage path (e.g. signatures/contract_1_doctor.png).
    Use this path for DB storage; serve via GET /api/storage/{path}.
    """
    root = Path(get_storage_root())
    subdir = root / SIGNATURES_SUBDIR
    subdir.mkdir(parents=True, exist_ok=True)

    ext = _ext_from_content_type(content_type)
    # Unique filename to avoid collisions if re-signed
    name = f"contract_{contract_id}_{role}_{uuid.uuid4().hex[:8]}.{ext}"
    path = subdir / name

    path.write_bytes(content)

    # Return relative path for DB (no leading slash)
    return f"{SIGNATURES_SUBDIR}/{name}"


def save_tenant_brand_asset(
    tenant_id: int, kind: Literal["logo", "hero", "product"], content: bytes, content_type: str
) -> str:
    """
    Save tenant branding asset image (logo/hero) and return public URL path mounted by FastAPI.
    Example return: /uploads/tenant-branding/tenant_1_logo_xxxx.png
    """
    root = Path(get_storage_root())
    subdir = root / TENANT_BRANDING_SUBDIR
    subdir.mkdir(parents=True, exist_ok=True)

    ext = _ext_from_content_type(content_type)
    name = f"tenant_{tenant_id}_{kind}_{uuid.uuid4().hex[:8]}.{ext}"
    path = subdir / name
    path.write_bytes(content)

    return f"/uploads/{TENANT_BRANDING_SUBDIR}/{name}"


def get_stored_file(storage_path: str) -> Path | None:
    """
    Resolve storage path to local file. Returns None if path is invalid or file missing.
    """
    if not storage_path or ".." in storage_path or storage_path.startswith("/"):
        return None
    root = Path(get_storage_root())
    full = root / storage_path
    if not full.is_file() or not str(full.resolve()).startswith(str(root.resolve())):
        return None
    return full
