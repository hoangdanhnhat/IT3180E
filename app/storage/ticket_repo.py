"""Low-level database access for tickets, messages, and status history."""

import uuid
from datetime import datetime, timedelta
import re

from sqlalchemy import extract, func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.storage.models import (
    Attachment,
    Ticket,
    TicketCategoryOption,
    TicketMessage,
    TicketPriority,
    TicketStatus,
    TicketStatusHistory,
    TicketUpvote,
    User,
)


DEFAULT_TICKET_CATEGORIES = (
    ("billing", "Billing & Payments"),
    ("delays", "Delays & Cancellations"),
    ("lost_found", "Lost & Found"),
    ("route", "Route Enquiry"),
    ("other", "Other"),
)


def normalize_category_key(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return normalized[:100]


def list_ticket_categories(db: Session, *, include_inactive: bool = False) -> list[TicketCategoryOption]:
    query = db.query(TicketCategoryOption)
    if not include_inactive:
        query = query.filter(TicketCategoryOption.is_active.is_(True))
    return query.order_by(TicketCategoryOption.label.asc()).all()


def get_ticket_category(db: Session, key: str) -> TicketCategoryOption | None:
    return db.query(TicketCategoryOption).filter(TicketCategoryOption.key == key).first()


def get_active_ticket_category(db: Session, key: str) -> TicketCategoryOption | None:
    return (
        db.query(TicketCategoryOption)
        .filter(TicketCategoryOption.key == key, TicketCategoryOption.is_active.is_(True))
        .first()
    )


def create_ticket_category(
    db: Session,
    *,
    key: str,
    label: str,
    is_active: bool = True,
) -> TicketCategoryOption:
    category = TicketCategoryOption(key=key, label=label, is_active=is_active)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_ticket_category_option(
    db: Session,
    category: TicketCategoryOption,
    *,
    label: str | None = None,
    is_active: bool | None = None,
) -> TicketCategoryOption:
    if label is not None:
        category.label = label
    if is_active is not None:
        category.is_active = is_active
    db.commit()
    db.refresh(category)
    return category


def count_tickets_in_category(db: Session, key: str) -> int:
    return db.query(func.count(Ticket.id)).filter(Ticket.category == key).scalar() or 0


def delete_ticket_category(db: Session, category: TicketCategoryOption) -> None:
    db.delete(category)
    db.commit()


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
    category: str,
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
    ticket = (
        db.query(Ticket)
        .options(
            joinedload(Ticket.submitter),
            joinedload(Ticket.assignee),
            selectinload(Ticket.messages)
            .joinedload(TicketMessage.sender),
            joinedload(Ticket.status_history),
            selectinload(Ticket.attachments),
        )
        .filter(Ticket.id == ticket_id)
        .first()
    )
    if ticket is not None:
        ticket.messages.sort(key=lambda m: m.created_at)
    return ticket


def get_public_ticket_by_number(db: Session, ticket_number: str) -> Ticket | None:
    """Return a public ticket by ticket_number, loading non-internal messages and attachments."""
    ticket = (
        db.query(Ticket)
        .options(
            selectinload(Ticket.messages).joinedload(TicketMessage.sender),
            selectinload(Ticket.attachments),
        )
        .filter(Ticket.ticket_number == ticket_number, Ticket.is_public.is_(True))
        .first()
    )
    if ticket is not None:
        ticket.messages = [m for m in ticket.messages if not m.is_internal]
        ticket.messages.sort(key=lambda m: m.created_at)
    return ticket


def list_tickets_for_user(db: Session, user_id: uuid.UUID) -> list[Ticket]:
    return (
        db.query(Ticket)
        .filter(Ticket.user_id == user_id)
        .order_by(Ticket.created_at.desc())
        .all()
    )


def list_all_tickets(db: Session) -> list[Ticket]:
    """Return all tickets with submitter and assignee relationships loaded."""
    return (
        db.query(Ticket)
        .options(
            joinedload(Ticket.submitter),
            joinedload(Ticket.assignee),
        )
        .order_by(Ticket.created_at.desc())
        .all()
    )


def list_tickets_assigned_to(db: Session, agent_id: uuid.UUID) -> list[Ticket]:
    """Return all tickets assigned to the given agent, newest-updated first."""
    return (
        db.query(Ticket)
        .options(
            joinedload(Ticket.submitter),
            joinedload(Ticket.assignee),
        )
        .filter(Ticket.assigned_to == agent_id)
        .order_by(Ticket.updated_at.desc())
        .all()
    )


def list_staff_visible_tickets(
    db: Session,
    *,
    category: str | None = None,
) -> list[Ticket]:
    """Return tickets visible to staff, optionally scoped by category."""
    query = db.query(Ticket).options(
        joinedload(Ticket.submitter),
        joinedload(Ticket.assignee),
    )
    if category:
        query = query.filter(Ticket.category == category)
    return query.order_by(Ticket.updated_at.desc()).all()


def list_public_tickets(
    db: Session,
    q: str | None = None,
    category: str | None = None,
) -> list[Ticket]:
    """Return all public tickets, optionally filtered by keyword and/or category."""
    query = db.query(Ticket).filter(
        Ticket.is_public.is_(True),
    )
    if q:
        # Simple ILIKE search; full tsvector search is wired via triggers (Phase 2)
        pattern = f"%{q}%"
        query = query.filter(
            Ticket.subject.ilike(pattern) | Ticket.description.ilike(pattern)
        )
    if category:
        query = query.filter(Ticket.category == category)
    return query.order_by(Ticket.public_upvote_count.desc(), Ticket.created_at.desc()).all()


def get_ticket_upvotes_for_user(
    db: Session,
    *,
    ticket_ids: list[uuid.UUID],
    user_id: uuid.UUID | None,
) -> set[uuid.UUID]:
    if not ticket_ids or user_id is None:
        return set()

    rows = (
        db.query(TicketUpvote.ticket_id)
        .filter(TicketUpvote.user_id == user_id, TicketUpvote.ticket_id.in_(ticket_ids))
        .all()
    )
    return {row[0] for row in rows}


def has_user_upvoted_ticket(db: Session, *, ticket_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return (
        db.query(TicketUpvote.id)
        .filter(TicketUpvote.ticket_id == ticket_id, TicketUpvote.user_id == user_id)
        .first()
        is not None
    )


def upvote_public_ticket(db: Session, *, ticket: Ticket, user_id: uuid.UUID) -> Ticket:
    if has_user_upvoted_ticket(db, ticket_id=ticket.id, user_id=user_id):
        setattr(ticket, "has_upvoted", True)
        return ticket

    db.add(TicketUpvote(ticket_id=ticket.id, user_id=user_id))
    ticket.public_upvote_count = (ticket.public_upvote_count or 0) + 1
    db.commit()
    db.refresh(ticket)
    setattr(ticket, "has_upvoted", True)
    return ticket


def remove_public_ticket_upvote(db: Session, *, ticket: Ticket, user_id: uuid.UUID) -> Ticket:
    vote = (
        db.query(TicketUpvote)
        .filter(TicketUpvote.ticket_id == ticket.id, TicketUpvote.user_id == user_id)
        .first()
    )
    if vote is None:
        setattr(ticket, "has_upvoted", False)
        return ticket

    db.delete(vote)
    ticket.public_upvote_count = max((ticket.public_upvote_count or 0) - 1, 0)
    db.commit()
    db.refresh(ticket)
    setattr(ticket, "has_upvoted", False)
    return ticket


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
    # Only the customer (or system auto-close) may close or reopen a resolved ticket
    (TicketStatus.resolved, TicketStatus.closed): "customer",
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
# Attachments
# ---------------------------------------------------------------------------

def create_attachment(
    db: Session,
    *,
    ticket_id: uuid.UUID,
    filename: str,
    storage_path: str,
    mime_type: str,
    file_size: int,
) -> Attachment:
    attachment = Attachment(
        ticket_id=ticket_id,
        filename=filename,
        storage_path=storage_path,
        mime_type=mime_type,
        file_size=file_size,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------

def assign_ticket(
    db: Session,
    ticket: Ticket,
    agent_id: uuid.UUID | None,
) -> Ticket:
    ticket.assigned_to = agent_id
    db.commit()
    db.refresh(ticket)
    return ticket


def update_ticket_category(
    db: Session,
    ticket: Ticket,
    category: str,
) -> Ticket:
    ticket.category = category
    db.commit()
    db.refresh(ticket)
    return ticket


def update_ticket_priority(
    db: Session,
    ticket: Ticket,
    priority: TicketPriority,
) -> Ticket:
    ticket.priority = priority
    db.commit()
    db.refresh(ticket)
    return ticket


# ---------------------------------------------------------------------------
# Auto-close stale resolved tickets
# ---------------------------------------------------------------------------

_AUTO_CLOSE_AFTER_DAYS = 7


def auto_close_stale_tickets(db: Session) -> int:
    """Close all resolved tickets that have been resolved for >= 7 days.

    Returns the number of tickets closed.
    """
    cutoff = datetime.utcnow() - timedelta(days=_AUTO_CLOSE_AFTER_DAYS)
    stale = (
        db.query(Ticket)
        .filter(
            Ticket.status == TicketStatus.resolved,
            Ticket.updated_at <= cutoff,
        )
        .all()
    )
    for ticket in stale:
        update_ticket_status(
            db,
            ticket,
            TicketStatus.closed,
            ticket.user_id,
            note="Automatically closed after 7 days with no activity",
        )
    return len(stale)
