from decimal import Decimal
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.auth_utils import get_current_user, get_current_user_optional
from app.db import get_db
from app.lib.storage import save_tenant_brand_asset
from app.models import CartItem, OrderItem, Product
from app.schemas.product import (
    ProductCreate,
    ProductListResponse,
    ProductResponse,
    ProductUpdate,
)

router = APIRouter(prefix="/api/products", tags=["Products"])

_ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
_MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024


def _normalize_role(user: Dict[str, Any] | None) -> str:
    return str((user or {}).get("role") or "").strip().upper()


def _require_tenant_manager(user: Dict[str, Any]) -> int:
    if _normalize_role(user) != "TENANT_MANAGER":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    tenant_id = user.get("tenant_id")
    if tenant_id is None:
        raise HTTPException(status_code=403, detail="Tenant access denied")
    try:
        return int(tenant_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Tenant access denied")


async def _store_product_image(
    tenant_id: int,
    image_file: UploadFile | None,
) -> str | None:
    if image_file is None:
        return None

    content = await image_file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Product image is empty")
    if len(content) > _MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Product image exceeds 5MB limit")

    content_type = (image_file.content_type or "").lower()
    if content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Product image type is not supported")

    return save_tenant_brand_asset(
        tenant_id=tenant_id,
        kind="product",
        content=content,
        content_type=content_type,
    )


@router.get("", response_model=ProductListResponse)
def list_products(
    tenant_id: int = Query(..., gt=0),
    q: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    sort: Literal["name_asc", "name_desc", "price_asc", "price_desc"] | None = Query(default=None),
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Dict[str, Any] | None = Depends(get_current_user_optional),
):
    role = _normalize_role(user)
    query = db.query(Product).filter(Product.tenant_id == tenant_id)

    if role == "TENANT_MANAGER":
        manager_tenant_id = _require_tenant_manager(user or {})
        if manager_tenant_id != tenant_id:
            raise HTTPException(status_code=403, detail="Tenant access denied")
    elif role != "SUPER_ADMIN":
        query = query.filter(Product.is_available.is_(True))

    normalized_category = (category or "").strip()
    normalized_query = (q or "").strip()

    if normalized_query:
        query = query.filter(Product.name.ilike(f"%{normalized_query}%"))
    if normalized_category:
        query = query.filter(func.lower(Product.category) == normalized_category.lower())
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)

    total = query.count()
    if sort == "name_asc":
        query = query.order_by(func.lower(Product.name).asc(), Product.product_id.asc())
    elif sort == "name_desc":
        query = query.order_by(func.lower(Product.name).desc(), Product.product_id.desc())
    elif sort == "price_asc":
        query = query.order_by(Product.price.asc(), Product.product_id.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.price.desc(), Product.product_id.desc())
    else:
        query = query.order_by(func.lower(Product.name).asc(), Product.product_id.asc())
    items = query.offset((page - 1) * size).limit(size).all()
    return ProductListResponse(items=items, page=page, page_size=size, total=total)


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    manager_tenant_id = _require_tenant_manager(user)
    if manager_tenant_id != payload.tenant_id:
        raise HTTPException(status_code=403, detail="Tenant access denied")

    product = Product(
        name=payload.name.strip(),
        description=payload.description,
        category=(payload.category or "").strip() or None,
        image_url=(payload.image_url or "").strip() or None,
        price=payload.price,
        stock_quantity=payload.stock_quantity,
        is_available=payload.is_available,
        tenant_id=payload.tenant_id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.post("/multipart", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product_multipart(
    name: str = Form(...),
    price: Decimal = Form(...),
    stock_quantity: int = Form(default=0),
    is_available: bool = Form(default=True),
    tenant_id: int = Form(...),
    description: Optional[str] = Form(default=None),
    category: Optional[str] = Form(default=None),
    image_file: UploadFile | None = File(default=None, alias="image"),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    manager_tenant_id = _require_tenant_manager(user)
    if manager_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Tenant access denied")

    product = Product(
        name=name.strip(),
        description=description,
        category=(category or "").strip() or None,
        image_url=await _store_product_image(tenant_id, image_file),
        price=price,
        stock_quantity=stock_quantity,
        is_available=is_available,
        tenant_id=tenant_id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_id:int}", response_model=ProductResponse)
def get_product(
    product_id: int,
    tenant_id: Optional[int] = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    user: Dict[str, Any] | None = Depends(get_current_user_optional),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    role = _normalize_role(user)
    if role == "TENANT_MANAGER":
        manager_tenant_id = _require_tenant_manager(user or {})
        if product.tenant_id != manager_tenant_id:
            raise HTTPException(status_code=403, detail="Tenant access denied")
        return product

    if tenant_id is not None and product.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if role != "SUPER_ADMIN" and not product.is_available:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{product_id:int}", response_model=ProductResponse)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    manager_tenant_id = _require_tenant_manager(user)
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.tenant_id != manager_tenant_id:
        raise HTTPException(status_code=403, detail="Tenant access denied")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if field in {"name", "category", "image_url"} and isinstance(value, str):
            value = value.strip()
            if field in {"category", "image_url"} and not value:
                value = None
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id:int}/multipart", response_model=ProductResponse)
async def update_product_multipart(
    product_id: int,
    name: str = Form(...),
    price: Decimal = Form(...),
    stock_quantity: int = Form(default=0),
    is_available: bool = Form(default=True),
    description: Optional[str] = Form(default=None),
    category: Optional[str] = Form(default=None),
    clear_image: bool = Form(default=False),
    image_file: UploadFile | None = File(default=None, alias="image"),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    manager_tenant_id = _require_tenant_manager(user)
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.tenant_id != manager_tenant_id:
        raise HTTPException(status_code=403, detail="Tenant access denied")

    product.name = name.strip()
    product.description = description
    product.category = (category or "").strip() or None
    product.price = price
    product.stock_quantity = stock_quantity
    product.is_available = is_available

    if clear_image:
        product.image_url = None
    stored_image_url = await _store_product_image(product.tenant_id, image_file)
    if stored_image_url is not None:
        product.image_url = stored_image_url

    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id:int}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    manager_tenant_id = _require_tenant_manager(user)
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.tenant_id != manager_tenant_id:
        raise HTTPException(status_code=403, detail="Tenant access denied")

    has_order_items = (
        db.query(OrderItem.id).filter(OrderItem.product_id == product_id).first() is not None
    )
    has_cart_items = (
        db.query(CartItem.id).filter(CartItem.product_id == product_id).first() is not None
    )

    if has_order_items or has_cart_items:
        product.is_available = False
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    try:
        db.delete(product)
        db.commit()
    except IntegrityError:
        db.rollback()
        product.is_available = False
        db.add(product)
        db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
