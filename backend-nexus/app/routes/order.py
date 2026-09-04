from decimal import Decimal
from typing import Any, Dict, Iterable

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth.auth_utils import get_current_user
from app.db import get_db
from app.models import Cart, CartItem, CartStatus, Order, OrderItem, OrderStatus, Patient, Product
from app.schemas.order import OrderCreate, OrderItemResponse, OrderListResponse, OrderResponse

router = APIRouter(prefix="/api/orders", tags=["Orders"])


def _normalize_role(user: Dict[str, Any]) -> str:
    return str(user.get("role") or "").strip().upper()


def _current_user_id(user: Dict[str, Any]) -> int:
    user_id = user.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        return int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _require_client(user: Dict[str, Any]) -> int:
    if _normalize_role(user) != "CLIENT":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return _current_user_id(user)


def _tenant_scope_for_manager(user: Dict[str, Any]) -> int:
    role = _normalize_role(user)
    if role not in {"TENANT_MANAGER", "SUPER_ADMIN"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if role == "SUPER_ADMIN":
        tenant_id = user.get("tenant_id")
        if tenant_id is None:
            raise HTTPException(status_code=400, detail="tenant_id is required")
        return int(tenant_id)
    tenant_id = user.get("tenant_id")
    if tenant_id is None:
        raise HTTPException(status_code=403, detail="Tenant access denied")
    return int(tenant_id)


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


def _serialize_order(order: Order) -> OrderResponse:
    items: list[OrderItemResponse] = []
    for item in order.items:
        line_total = Decimal(str(item.price_at_purchase)) * item.quantity
        items.append(
            OrderItemResponse(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                price_at_purchase=float(item.price_at_purchase),
                product_name=item.product.name if item.product else f"Product #{item.product_id}",
                line_total=float(line_total),
            )
        )
    return OrderResponse(
        id=order.id,
        tenant_id=order.tenant_id,
        patient_user_id=order.patient_user_id,
        status=order.status.value if hasattr(order.status, "value") else str(order.status),
        subtotal=float(order.subtotal),
        tax=float(order.tax),
        discount=float(order.discount),
        total_amount=float(order.total_amount),
        items=items,
        created_at=order.created_at,
    )


def _load_order(db: Session, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _enforce_order_access(order: Order, user: Dict[str, Any], tenant_id: int | None = None) -> None:
    role = _normalize_role(user)
    user_id = _current_user_id(user)

    if role == "CLIENT":
        if order.patient_user_id != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if tenant_id is not None and order.tenant_id != tenant_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        return

    if role in {"TENANT_MANAGER", "SUPER_ADMIN"}:
        token_tenant_id = user.get("tenant_id")
        if role == "TENANT_MANAGER":
            if token_tenant_id is None or int(token_tenant_id) != order.tenant_id:
                raise HTTPException(status_code=403, detail="Tenant access denied")
        elif tenant_id is not None and order.tenant_id != tenant_id:
            raise HTTPException(status_code=403, detail="Tenant access denied")
        return

    raise HTTPException(status_code=403, detail="Insufficient permissions")


def _collect_unavailable_products(products: Iterable[Product], cart_items: list[CartItem]) -> list[str]:
    products_by_id = {product.product_id: product for product in products}
    unavailable: list[str] = []
    for item in cart_items:
        product = products_by_id.get(item.product_id)
        product_name = item.product.name if item.product else f"Product #{item.product_id}"
        if product is None or not product.is_available or product.stock_quantity < item.quantity:
            unavailable.append(product_name)
    return unavailable


@router.post("", response_model=OrderResponse, status_code=201)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    patient_user_id = _require_client(user)
    _ensure_patient_membership(db, payload.tenant_id, patient_user_id)

    locked_cart = (
        db.query(Cart)
        .filter(
            Cart.tenant_id == payload.tenant_id,
            Cart.patient_user_id == patient_user_id,
            Cart.status == CartStatus.ACTIVE,
        )
        .order_by(Cart.id.desc())
        .with_for_update()
        .first()
    )
    if locked_cart is None:
        raise HTTPException(status_code=400, detail="Active cart is empty")

    cart = (
        db.query(Cart)
        .options(joinedload(Cart.items).joinedload(CartItem.product))
        .filter(Cart.id == locked_cart.id)
        .first()
    )
    if cart is None or not cart.items:
        raise HTTPException(status_code=400, detail="Active cart is empty")

    product_ids = [item.product_id for item in cart.items]
    products = (
        db.query(Product)
        .filter(Product.product_id.in_(product_ids))
        .with_for_update()
        .all()
    )
    unavailable = _collect_unavailable_products(products, cart.items)
    if unavailable:
        raise HTTPException(
            status_code=409,
            detail=f"Unavailable or insufficient stock for: {', '.join(unavailable)}",
        )

    products_by_id = {product.product_id: product for product in products}
    subtotal = Decimal("0")
    order = Order(
        patient_user_id=patient_user_id,
        tenant_id=payload.tenant_id,
        status=OrderStatus.PENDING,
        subtotal=Decimal("0"),
        tax=Decimal("0"),
        discount=Decimal("0"),
        total_amount=Decimal("0"),
    )
    db.add(order)
    db.flush()

    for cart_item in cart.items:
        product = products_by_id[cart_item.product_id]
        price = Decimal(str(product.price))
        subtotal += price * cart_item.quantity
        product.stock_quantity -= cart_item.quantity
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.product_id,
                quantity=cart_item.quantity,
                price_at_purchase=price,
            )
        )

    order.subtotal = subtotal
    order.tax = Decimal("0")
    order.discount = Decimal("0")
    order.total_amount = subtotal
    cart.status = CartStatus.CONVERTED

    db.commit()
    return _serialize_order(_load_order(db, order.id))


@router.get("", response_model=OrderListResponse)
def list_orders(
    tenant_id: int | None = Query(default=None, gt=0),
    status_value: OrderStatus | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    role = _normalize_role(user)
    query = db.query(Order).options(joinedload(Order.items).joinedload(OrderItem.product))

    if role == "CLIENT":
        query = query.filter(Order.patient_user_id == _current_user_id(user))
        if tenant_id is not None:
            query = query.filter(Order.tenant_id == tenant_id)
    elif role in {"TENANT_MANAGER", "SUPER_ADMIN"}:
        scoped_tenant_id = tenant_id if tenant_id is not None else _tenant_scope_for_manager(user)
        if role == "TENANT_MANAGER" and scoped_tenant_id != int(user.get("tenant_id")):
            raise HTTPException(status_code=403, detail="Tenant access denied")
        query = query.filter(Order.tenant_id == scoped_tenant_id)
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if status_value is not None:
        query = query.filter(Order.status == status_value)

    total = query.count()
    orders = query.order_by(Order.created_at.desc(), Order.id.desc()).offset((page - 1) * size).limit(size).all()
    return OrderListResponse(
        items=[_serialize_order(order) for order in orders],
        page=page,
        page_size=size,
        total=total,
    )


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int,
    tenant_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    order = _load_order(db, order_id)
    _enforce_order_access(order, user, tenant_id=tenant_id)
    return _serialize_order(order)


@router.patch("/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    order = _load_order(db, order_id)
    role = _normalize_role(user)
    _enforce_order_access(order, user)

    if role == "CLIENT":
        if order.status != OrderStatus.PENDING:
            raise HTTPException(status_code=400, detail="Only PENDING orders can be cancelled")
    elif order.status == OrderStatus.PAID:
        raise HTTPException(status_code=400, detail="PAID orders cannot be cancelled")

    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Order is already cancelled")

    products = (
        db.query(Product)
        .filter(Product.product_id.in_([item.product_id for item in order.items]))
        .with_for_update()
        .all()
    )
    products_by_id = {product.product_id: product for product in products}
    for item in order.items:
        product = products_by_id.get(item.product_id)
        if product is not None:
            product.stock_quantity += item.quantity

    order.status = OrderStatus.CANCELLED
    db.commit()
    return _serialize_order(_load_order(db, order.id))


@router.patch("/{order_id}/mark-paid", response_model=OrderResponse)
def mark_order_paid(
    order_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Manually mark a PENDING order as PAID (tenant manager / testing only — bypasses payment)."""
    role = _normalize_role(user)
    if role not in {"TENANT_MANAGER", "SUPER_ADMIN"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    order = _load_order(db, order_id)
    _enforce_order_access(order, user)

    if order.status != OrderStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Only PENDING orders can be marked as paid (current status: {order.status.value})",
        )

    order.status = OrderStatus.PAID
    db.commit()
    return _serialize_order(_load_order(db, order.id))


@router.patch("/{order_id}/refund", response_model=OrderResponse)
def refund_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    role = _normalize_role(user)
    if role not in {"TENANT_MANAGER", "SUPER_ADMIN"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    order = _load_order(db, order_id)
    _enforce_order_access(order, user)
    if order.status != OrderStatus.PAID:
        raise HTTPException(status_code=400, detail="Only PAID orders can be refunded")

    order.status = OrderStatus.REFUNDED
    db.commit()
    return _serialize_order(_load_order(db, order.id))
