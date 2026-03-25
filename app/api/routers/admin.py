"""Admin-only endpoints.

GET    /admin/users                         Admin — list all users with ticket counts
GET    /admin/users/{user_id}/tickets       Admin — list tickets for a specific user
POST   /admin/users                         Admin — manually create a new account
PATCH  /admin/users/{user_id}/role          Admin — assign a role to an account
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies import require_admin
from app.api.schemas import AdminCreateUser, RoleUpdate, TicketBrief, UserAdminOut, UserOut
from app.core.db import get_db
from app.storage import ticket_repo, user_repo
from app.storage.models import Ticket, User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserAdminOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Return all users with their ticket counts."""
    rows = (
        db.query(User, func.count(Ticket.id).label("tc"))
        .outerjoin(Ticket, Ticket.user_id == User.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
        .all()
    )
    return [
        UserAdminOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            ticket_count=tc,
        )
        for u, tc in rows
    ]


@router.get("/users/{user_id}/tickets", response_model=list[TicketBrief])
def list_user_tickets(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Return all tickets submitted by a specific user."""
    user = user_repo.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return ticket_repo.list_tickets_for_user(db, user_id)


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    body: AdminCreateUser,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Manually create a new account with a specified role."""
    if user_repo.get_user_by_email(db, body.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    return user_repo.create_user(
        db,
        email=body.email,
        password=body.password,
        full_name=body.full_name,
        role=body.role,
    )


@router.patch("/users/{user_id}/role", response_model=UserOut)
def update_role(
    user_id: uuid.UUID,
    body: RoleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Assign a role to a specific account."""
    user = user_repo.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user_repo.update_user_role(db, user, body.role)
