from decimal import Decimal
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session, joinedload

from app.auth.auth_utils import get_current_user
from app.db import get_db
from app.models import Cart, CartItem, CartStatus, Patient, Product
from app.schemas.cart import (
    CartItemCreate,
    CartItemUpdate,
    CartItemResponse,
    CartResponse,
)
from app.schemas.product import ProductResponse

router = APIRouter(prefix="/api/cart", tags=["Cart"])


def _normalize_role(user: Dict[str, Any]) -> str:
    return str(user.get("role") or "").strip().upper()


def _require_client(user: Dict[str, Any]) -> int:
    if _normalize_role(user) != "CLIENT":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    user_id = user.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        return int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _ensure_patient_membership(db: Session, tenant_id: int, patient_user_id: int) -> None:
    patient = (
        db.query(Patient)
        .filter(Patient.tenant_id == tenant_id, Patient.user_id == patient_user_id)
        .first()
    )
    if patient is None:
        raise HTTPException(
            status_code=403,
            detail="Client does not belong to the specified tenant",
        )


def _serialize_cart(cart: Cart) -> CartResponse:
    items: list[CartItemResponse] = []
    subtotal = Decimal("0")
    for item in cart.items:
        price = Decimal(str(item.product.price))
        line_total = price * item.quantity
        subtotal += line_total
        items.append(
            CartItemResponse(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                product=ProductResponse.model_validate(item.product),
                line_total=float(line_total),
            )
        )

    return CartResponse(
        id=cart.id,
        tenant_id=cart.tenant_id,
        patient_user_id=cart.patient_user_id,
        status=cart.status.value if hasattr(cart.status, "value") else str(cart.status),
        items=items,
        subtotal=float(subtotal),
    )


def _get_or_create_active_cart(
    db: Session,
    *,
    tenant_id: int,
    patient_user_id: int,
) -> Cart:
    _ensure_patient_membership(db, tenant_id, patient_user_id)
    cart = (
        db.query(Cart)
        .options(joinedload(Cart.items).joinedload(CartItem.product))
        .filter(
            Cart.tenant_id == tenant_id,
            Cart.patient_user_id == patient_user_id,
            Cart.status == CartStatus.ACTIVE,
        )
        .order_by(Cart.id.desc())
        .first()
    )
    if cart is not None:
        return cart

    cart = Cart(
        tenant_id=tenant_id,
        patient_user_id=patient_user_id,
        status=CartStatus.ACTIVE,
    )
    db.add(cart)
    db.commit()
    return (
        db.query(Cart)
        .options(joinedload(Cart.items).joinedload(CartItem.product))
        .filter(Cart.id == cart.id)
        .one()
    )


def _load_active_cart_item(
    db: Session,
    *,
    item_id: int,
    patient_user_id: int,
) -> CartItem:
    item = (
        db.query(CartItem)
        .options(joinedload(CartItem.product), joinedload(CartItem.cart))
        .join(Cart, Cart.id == CartItem.cart_id)
        .filter(
            CartItem.id == item_id,
            Cart.patient_user_id == patient_user_id,
            Cart.status == CartStatus.ACTIVE,
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    return item


@router.get("", response_model=CartResponse)
def get_cart(
    tenant_id: int = Query(..., gt=0),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    patient_user_id = _require_client(user)
    cart = _get_or_create_active_cart(
        db,
        tenant_id=tenant_id,
        patient_user_id=patient_user_id,
    )
    return _serialize_cart(cart)


@router.post("/items", response_model=CartResponse, status_code=status.HTTP_201_CREATED)
def add_cart_item(
    payload: CartItemCreate,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    patient_user_id = _require_client(user)
    cart = _get_or_create_active_cart(
        db,
        tenant_id=payload.tenant_id,
        patient_user_id=patient_user_id,
    )

    product = (
        db.query(Product)
        .filter(
            Product.product_id == payload.product_id,
            Product.tenant_id == payload.tenant_id,
        )
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.is_available:
        raise HTTPException(status_code=409, detail=f"{product.name} is unavailable")

    existing_item = next((item for item in cart.items if item.product_id == payload.product_id), None)
    requested_quantity = payload.quantity + (existing_item.quantity if existing_item else 0)
    if product.stock_quantity < requested_quantity:
        raise HTTPException(
            status_code=409,
            detail=f"Insufficient stock for {product.name}",
        )

    if existing_item:
        existing_item.quantity = requested_quantity
    else:
        db.add(
            CartItem(
                cart_id=cart.id,
                product_id=payload.product_id,
                quantity=payload.quantity,
            )
        )

    db.commit()
    refreshed_cart = (
        db.query(Cart)
        .options(joinedload(Cart.items).joinedload(CartItem.product))
        .filter(Cart.id == cart.id)
        .one()
    )
    return _serialize_cart(refreshed_cart)


@router.put("/items/{item_id}", response_model=CartResponse)
def update_cart_item(
    item_id: int,
    payload: CartItemUpdate,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    patient_user_id = _require_client(user)
    item = _load_active_cart_item(db, item_id=item_id, patient_user_id=patient_user_id)

    if payload.quantity == 0:
        cart_id = item.cart_id
        db.delete(item)
        db.commit()
        cart = (
            db.query(Cart)
            .options(joinedload(Cart.items).joinedload(CartItem.product))
            .filter(Cart.id == cart_id)
            .one()
        )
        return _serialize_cart(cart)

    if item.product.stock_quantity < payload.quantity:
        raise HTTPException(
            status_code=409,
            detail=f"Insufficient stock for {item.product.name}",
        )

    item.quantity = payload.quantity
    db.commit()
    cart = (
        db.query(Cart)
        .options(joinedload(Cart.items).joinedload(CartItem.product))
        .filter(Cart.id == item.cart_id)
        .one()
    )
    return _serialize_cart(cart)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cart_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    patient_user_id = _require_client(user)
    item = _load_active_cart_item(db, item_id=item_id, patient_user_id=patient_user_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_cart(
    tenant_id: int = Query(..., gt=0),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    patient_user_id = _require_client(user)
    cart = _get_or_create_active_cart(
        db,
        tenant_id=tenant_id,
        patient_user_id=patient_user_id,
    )
    for item in list(cart.items):
        db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
