import uuid

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.storage.models import User, UserRole


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def create_user(
    db: Session,
    email: str,
    password: str,
    full_name: str,
    role: UserRole = UserRole.customer,
) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def admin_exists(db: Session) -> bool:
    return db.query(User).filter(User.role == UserRole.admin).first() is not None
