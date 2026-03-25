"""Business logic layer for ticket operations.

This service coordinates the repository, validates the state-machine rules,
and dispatches notifications on status transitions.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.storage import ticket_repo
from app.storage.models import Ticket, TicketMessage, TicketStatus, UserRole


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def create_ticket(
    db: Session,
    *,
    user_id: uuid.UUID,
    subject: str,
    description: str,
    category,
    priority,
    is_public: bool,
) -> Ticket:
    return ticket_repo.create_ticket(
        db,
        user_id=user_id,
        subject=subject,
        description=description,
        category=category,
        priority=priority,
        is_public=is_public,
    )


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_ticket_or_404(db: Session, ticket_id: uuid.UUID) -> Ticket:
    ticket = ticket_repo.get_ticket_by_id(db, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


def list_own_tickets(db: Session, user_id: uuid.UUID) -> list[Ticket]:
    return ticket_repo.list_tickets_for_user(db, user_id)


def list_public_tickets(db: Session, q: str | None = None) -> list[Ticket]:
    return ticket_repo.list_public_resolved_tickets(db, q)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

def add_message(
    db: Session,
    *,
    ticket: Ticket,
    sender_id: uuid.UUID,
    sender_role: UserRole,
    content: str,
    is_internal: bool,
) -> TicketMessage:
    # Only agents/admins may post internal notes
    if is_internal and sender_role not in (UserRole.agent, UserRole.admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only agents and admins may post internal notes",
        )
    # If a customer replies on a Pending Customer ticket → auto-transition to In Progress
    if (
        sender_role == UserRole.customer
        and ticket.status == TicketStatus.pending_customer
    ):
        ticket_repo.update_ticket_status(
            db,
            ticket,
            TicketStatus.in_progress,
            sender_id,
            note="Customer replied; ticket moved back to In Progress",
        )

    return ticket_repo.add_message(
        db,
        ticket_id=ticket.id,
        sender_id=sender_id,
        content=content,
        is_internal=is_internal,
    )


# ---------------------------------------------------------------------------
# Status change
# ---------------------------------------------------------------------------

def change_status(
    db: Session,
    *,
    ticket: Ticket,
    new_status: TicketStatus,
    actor_id: uuid.UUID,
    actor_role: UserRole,
    note: str | None = None,
) -> Ticket:
    role_str = actor_role.value  # "customer" | "agent" | "admin"
    # Treat admin as agent for state-machine purposes
    effective_role = "agent" if role_str == "admin" else role_str

    if not ticket_repo.is_valid_transition(ticket.status, new_status, effective_role):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Transition from '{ticket.status.value}' to '{new_status.value}' "
                f"is not permitted for role '{role_str}'"
            ),
        )

    return ticket_repo.update_ticket_status(db, ticket, new_status, actor_id, note)


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------

def assign_ticket(
    db: Session,
    *,
    ticket: Ticket,
    agent_id: uuid.UUID,
    agent: object,  # User object – validated by caller
) -> Ticket:
    return ticket_repo.assign_ticket(db, ticket, agent_id)
