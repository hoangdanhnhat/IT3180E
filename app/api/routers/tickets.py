"""Ticket CRUD endpoints.

Endpoints
---------
POST   /tickets                  Customer   — submit a new ticket
GET    /tickets                  Customer   — list own tickets
GET    /tickets/public           Public     — browse public resolved tickets
GET    /tickets/{id}             Customer / Agent — get ticket detail + messages
POST   /tickets/{id}/messages    Customer / Agent — add reply or internal note
PATCH  /tickets/{id}/status      Agent      — change ticket status
PATCH  /tickets/{id}/assign      Agent      — assign ticket to an agent
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_current_user,
    require_agent_or_admin,
)
from app.api.schemas import (
    AssignUpdate,
    MessageCreate,
    MessageOut,
    PublicTicketOut,
    StatusUpdate,
    TicketCreate,
    TicketDetail,
    TicketOut,
)
from app.core.db import get_db
from app.core.exceptions import ForbiddenException, NotFoundException
from app.services import ticket_service
from app.storage import user_repo
from app.storage.models import User, UserRole

router = APIRouter(prefix="/tickets", tags=["tickets"])


# ---------------------------------------------------------------------------
# Public — browse resolved tickets
# ---------------------------------------------------------------------------

@router.get("/public", response_model=list[PublicTicketOut])
def list_public_tickets(
    q: str | None = Query(default=None, description="Keyword filter"),
    db: Session = Depends(get_db),
):
    """Return resolved public tickets. Optionally filter by keyword."""
    return ticket_service.list_public_tickets(db, q)


# ---------------------------------------------------------------------------
# Customer — submit a ticket
# ---------------------------------------------------------------------------

@router.post("", response_model=TicketOut, status_code=201)
def create_ticket(
    body: TicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a new support ticket. Access token required."""
    return ticket_service.create_ticket(
        db,
        user_id=current_user.id,
        subject=body.subject,
        description=body.description,
        category=body.category,
        priority=body.priority,
        is_public=body.is_public,
    )


# ---------------------------------------------------------------------------
# Customer — list own tickets
# ---------------------------------------------------------------------------

@router.get("", response_model=list[TicketOut])
def list_own_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all tickets submitted by the authenticated customer."""
    return ticket_service.list_own_tickets(db, current_user.id)


# ---------------------------------------------------------------------------
# Customer / Agent — get ticket detail
# ---------------------------------------------------------------------------

@router.get("/{ticket_id}", response_model=TicketDetail)
def get_ticket(
    ticket_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return full ticket detail including messages and status history.

    - Customers may only view their own tickets.
    - Agents and admins may view any ticket.
    - Internal notes are stripped for customers.
    """
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)

    is_agent_or_admin = current_user.role in (UserRole.agent, UserRole.admin)
    if not is_agent_or_admin and ticket.user_id != current_user.id:
        raise ForbiddenException("You do not have access to this ticket")

    # Hide internal messages from customers
    if not is_agent_or_admin:
        ticket.messages = [m for m in ticket.messages if not m.is_internal]

    return ticket


# ---------------------------------------------------------------------------
# Customer / Agent — add a message
# ---------------------------------------------------------------------------

@router.post("/{ticket_id}/messages", response_model=MessageOut, status_code=201)
def add_message(
    ticket_id: uuid.UUID,
    body: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a reply (or an internal note for agents/admins) to a ticket.

    Posting to a *Pending Customer* ticket by the owning customer automatically
    transitions the ticket back to *In Progress*.
    """
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)

    is_agent_or_admin = current_user.role in (UserRole.agent, UserRole.admin)
    if not is_agent_or_admin and ticket.user_id != current_user.id:
        raise ForbiddenException("You do not have access to this ticket")

    return ticket_service.add_message(
        db,
        ticket=ticket,
        sender_id=current_user.id,
        sender_role=current_user.role,
        content=body.content,
        is_internal=body.is_internal,
    )


# ---------------------------------------------------------------------------
# Agent — change ticket status
# ---------------------------------------------------------------------------

@router.patch("/{ticket_id}/status", response_model=TicketOut)
def update_status(
    ticket_id: uuid.UUID,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Transition a ticket to a new status.

    Invalid transitions are rejected with **422 Unprocessable Entity**.
    """
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)
    return ticket_service.change_status(
        db,
        ticket=ticket,
        new_status=body.status,
        actor_id=current_user.id,
        actor_role=current_user.role,
        note=body.note,
    )


# ---------------------------------------------------------------------------
# Agent — assign ticket
# ---------------------------------------------------------------------------

@router.patch("/{ticket_id}/assign", response_model=TicketOut)
def assign_ticket(
    ticket_id: uuid.UUID,
    body: AssignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Assign a ticket to an agent (or re-assign it)."""
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)

    agent = user_repo.get_user_by_id(db, body.agent_id)
    if agent is None or agent.role not in (UserRole.agent, UserRole.admin):
        raise NotFoundException("Agent not found or user is not an agent")

    return ticket_service.assign_ticket(db, ticket=ticket, agent_id=body.agent_id, agent=agent)
