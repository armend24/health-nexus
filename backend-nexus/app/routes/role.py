from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import Role
from app.schemas import RoleCreate, RoleRead, RoleUpdate

router = APIRouter(prefix="/roles", tags=["Roles"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
def create_role(role: RoleCreate, db: Session = Depends(get_db)):
    db_role = Role(**role.model_dump())
    try:
        db.add(db_role)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Role name already exists")
    db.refresh(db_role)
    return db_role


@router.get("", response_model=list[RoleRead])
def list_roles(skip: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    roles = db.query(Role).offset(skip).limit(limit).all()
    return roles


@router.get("/{role_id}", response_model=RoleRead)
def get_role(role_id: int, db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.put("/{role_id}", response_model=RoleRead)
def update_role(role_id: int, role: RoleUpdate, db: Session = Depends(get_db)):
    db_role = db.query(Role).filter(Role.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")

    update_data = role.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_role, key, value)

    db.commit()
    db.refresh(db_role)
    return db_role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: int, db: Session = Depends(get_db)):
    db_role = db.query(Role).filter(Role.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")

    db.delete(db_role)
    db.commit()
    return None
