"""Low-level database access for tickets, messages, and status history."""

import uuid
from datetime import datetime

from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload

from app.storage.models import (
    Ticket,
    TicketCategory,
    TicketMessage,
    TicketPriority,
    TicketStatus,
    TicketStatusHistory,
    User,
)


# ---------------------------------------------------------------------------
# Ticket number generation
# ---------------------------------------------------------------------------

def _count_tickets_this_month(db: Session, year: int, month: int) -> int:
    """Return how many tickets already exist for the given year/month."""
    return (
        db.query(func.count(Ticket.id))
        .filter(
            extract("year", Ticket.created_at) == year,
            extract("month", Ticket.created_at) == month,
        )
        .scalar()
        or 0
    )


def generate_ticket_number(db: Session) -> str:
    """Generate a unique ticket number of the form TKT-YYYY-MM-NNNNN."""
    now = datetime.utcnow()
    year, month = now.year, now.month
    count = _count_tickets_this_month(db, year, month)
    sequence = count + 1
    return f"TKT-{year}-{month:02d}-{sequence:05d}"


# ---------------------------------------------------------------------------
# Ticket CRUD
# ---------------------------------------------------------------------------

def create_ticket(
    db: Session,
    *,
    user_id: uuid.UUID,
    subject: str,
    description: str,
    category: TicketCategory,
    priority: TicketPriority,
    is_public: bool,
) -> Ticket:
    ticket_number = generate_ticket_number(db)
    ticket = Ticket(
        ticket_number=ticket_number,
        user_id=user_id,
        subject=subject,
        description=description,
        category=category,
        priority=priority,
        status=TicketStatus.open,
        is_public=is_public,
    )
    db.add(ticket)
    # Record initial status in history
    history = TicketStatusHistory(
        ticket=ticket,
        changed_by=user_id,
        old_status=None,
        new_status=TicketStatus.open,
        note="Ticket created",
    )
    db.add(history)
    db.commit()
    db.refresh(ticket)
    return ticket


def get_ticket_by_id(db: Session, ticket_id: uuid.UUID) -> Ticket | None:
    return (
        db.query(Ticket)
        .options(
            joinedload(Ticket.submitter),
            joinedload(Ticket.messages).joinedload(TicketMessage.sender),
            joinedload(Ticket.status_history),
        )
        .filter(Ticket.id == ticket_id)
        .first()
    )


def list_tickets_for_user(db: Session, user_id: uuid.UUID) -> list[Ticket]:
    return (
        db.query(Ticket)
        .filter(Ticket.user_id == user_id)
        .order_by(Ticket.created_at.desc())
        .all()
    )


def list_public_resolved_tickets(db: Session, q: str | None = None) -> list[Ticket]:
    """Return resolved public tickets, optionally filtered by keyword."""
    query = db.query(Ticket).filter(
        Ticket.is_public.is_(True),
        Ticket.status == TicketStatus.resolved,
    )
    if q:
        # Simple ILIKE search; full tsvector search is wired via triggers (Phase 2)
        pattern = f"%{q}%"
        query = query.filter(
            Ticket.subject.ilike(pattern) | Ticket.description.ilike(pattern)
        )
    return query.order_by(Ticket.created_at.desc()).all()


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

def add_message(
    db: Session,
    *,
    ticket_id: uuid.UUID,
    sender_id: uuid.UUID,
    content: str,
    is_internal: bool,
) -> TicketMessage:
    message = TicketMessage(
        ticket_id=ticket_id,
        sender_id=sender_id,
        content=content,
        is_internal=is_internal,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    # Reload with sender relationship
    db.refresh(message)
    _ = message.sender  # eagerly load
    return message


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------

# Valid transitions: (from_status, to_status) -> who can trigger
# "customer" | "agent" | "system"
_VALID_TRANSITIONS: dict[tuple[TicketStatus, TicketStatus], str] = {
    (TicketStatus.open, TicketStatus.in_progress): "agent",
    (TicketStatus.in_progress, TicketStatus.pending_customer): "agent",
    (TicketStatus.pending_customer, TicketStatus.in_progress): "customer",
    (TicketStatus.in_progress, TicketStatus.resolved): "agent",
    (TicketStatus.resolved, TicketStatus.closed): "any",
    (TicketStatus.resolved, TicketStatus.open): "customer",
}


def is_valid_transition(
    old: TicketStatus, new: TicketStatus, actor_role: str
) -> bool:
    """Return True if the transition is permitted for the given role."""
    allowed_actor = _VALID_TRANSITIONS.get((old, new))
    if allowed_actor is None:
        return False
    if allowed_actor == "any":
        return True
    return actor_role == allowed_actor


def update_ticket_status(
    db: Session,
    ticket: Ticket,
    new_status: TicketStatus,
    changed_by: uuid.UUID,
    note: str | None = None,
) -> Ticket:
    old_status = ticket.status
    ticket.status = new_status
    history = TicketStatusHistory(
        ticket_id=ticket.id,
        changed_by=changed_by,
        old_status=old_status,
        new_status=new_status,
        note=note,
    )
    db.add(history)
    db.commit()
    db.refresh(ticket)
    return ticket


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------

def assign_ticket(
    db: Session,
    ticket: Ticket,
    agent_id: uuid.UUID,
) -> Ticket:
    ticket.assigned_to = agent_id
    db.commit()
    db.refresh(ticket)
    return ticket
