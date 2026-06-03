"""Business logic layer for ticket operations.

This service coordinates the repository, validates the state-machine rules,
and dispatches notifications on status transitions.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.services import notification_service
from app.storage import ticket_repo
from app.storage import user_repo
from app.storage.models import Ticket, TicketMessage, TicketStatus, User, UserRole


def _send_reply_notification(ticket: Ticket, message: TicketMessage, sender_role: UserRole) -> None:
    try:
        if message.is_internal:
            return

        sender = message.sender
        recipient: User | None = None
        if sender_role in (UserRole.agent, UserRole.admin):
            recipient = ticket.submitter
        elif sender_role == UserRole.customer:
            recipient = ticket.assignee

        if recipient is None:
            notification_service.logger.warning(
                "Skipping reply notification for ticket %s: no recipient for sender role %s",
                ticket.ticket_number,
                sender_role.value,
            )
            return

        template = notification_service.format_reply_notification(
            ticket=ticket,
            sender_name=sender.full_name,
            reply_content=message.content,
        )
        notification_service.send_email(
            to_email=recipient.email,
            subject=template.subject,
            text_body=template.text_body,
            html_body=template.html_body,
        )
    except Exception:
        notification_service.logger.exception(
            "Failed to process reply notification for ticket %s",
            ticket.ticket_number,
        )


def _send_status_change_notifications(
    *,
    ticket: Ticket,
    actor: User | None,
    old_status: TicketStatus,
    new_status: TicketStatus,
    note: str | None,
) -> None:
    try:
        actor_name = actor.full_name if actor else "A user"
        template = notification_service.format_status_change_notification(
            ticket=ticket,
            actor_name=actor_name,
            old_status=old_status,
            new_status=new_status,
            note=note,
        )

        recipients = [ticket.submitter, ticket.assignee]
        seen: set[str] = set()
        for recipient in recipients:
            if recipient is None:
                notification_service.logger.warning(
                    "Skipping status notification for ticket %s: missing recipient",
                    ticket.ticket_number,
                )
                continue
            if not recipient.email or recipient.email in seen:
                if not recipient.email:
                    notification_service.logger.warning(
                        "Skipping status notification for ticket %s: missing email",
                        ticket.ticket_number,
                    )
                continue
            seen.add(recipient.email)
            notification_service.send_email(
                to_email=recipient.email,
                subject=template.subject,
                text_body=template.text_body,
                html_body=template.html_body,
            )
    except Exception:
        notification_service.logger.exception(
            "Failed to process status notification for ticket %s",
            ticket.ticket_number,
        )


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
    if ticket_repo.get_active_ticket_category(db, category) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ticket category is not available",
        )
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


def list_public_tickets(
    db: Session,
    q: str | None = None,
    category=None,
    viewer_id: uuid.UUID | None = None,
) -> list[Ticket]:
    tickets = ticket_repo.list_public_tickets(db, q, category)
    voted_ids = ticket_repo.get_ticket_upvotes_for_user(
        db,
        ticket_ids=[ticket.id for ticket in tickets],
        user_id=viewer_id,
    )
    for ticket in tickets:
        setattr(ticket, "has_upvoted", ticket.id in voted_ids)
    return tickets


def get_public_ticket_by_number(
    db: Session,
    ticket_number: str,
    *,
    viewer_id: uuid.UUID | None = None,
) -> Ticket | None:
    ticket = ticket_repo.get_public_ticket_by_number(db, ticket_number)
    if ticket is not None:
        has_upvoted = (
            viewer_id is not None
            and ticket_repo.has_user_upvoted_ticket(
                db,
                ticket_id=ticket.id,
                user_id=viewer_id,
            )
        )
        setattr(ticket, "has_upvoted", has_upvoted)
    return ticket


def upvote_public_ticket(db: Session, ticket_number: str, user_id: uuid.UUID) -> Ticket:
    ticket = ticket_repo.get_public_ticket_by_number(db, ticket_number)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket_repo.upvote_public_ticket(db, ticket=ticket, user_id=user_id)


def remove_public_ticket_upvote(db: Session, ticket_number: str, user_id: uuid.UUID) -> Ticket:
    ticket = ticket_repo.get_public_ticket_by_number(db, ticket_number)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket_repo.remove_public_ticket_upvote(db, ticket=ticket, user_id=user_id)


def list_assigned_tickets(db: Session, agent_id: uuid.UUID) -> list[Ticket]:
    return ticket_repo.list_tickets_assigned_to(db, agent_id)


def list_staff_visible_tickets(db: Session, category=None) -> list[Ticket]:
    return ticket_repo.list_staff_visible_tickets(db, category=category)


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

    # Agents (not admins) may only reply to tickets assigned to them
    if sender_role == UserRole.agent and ticket.assigned_to != sender_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only reply to tickets assigned to you",
        )

    # If an agent/admin replies to an Open ticket → auto-transition to In Progress
    if (
        sender_role in (UserRole.agent, UserRole.admin)
        and ticket.status == TicketStatus.open
    ):
        ticket_repo.update_ticket_status(
            db,
            ticket,
            TicketStatus.in_progress,
            sender_id,
            note="Agent replied; ticket moved to In Progress",
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

    message = ticket_repo.add_message(
        db,
        ticket_id=ticket.id,
        sender_id=sender_id,
        content=content,
        is_internal=is_internal,
    )
    _send_reply_notification(ticket, message, sender_role)
    return message


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

    old_status = ticket.status
    updated_ticket = ticket_repo.update_ticket_status(db, ticket, new_status, actor_id, note)
    actor = user_repo.get_user_by_id(db, actor_id)
    _send_status_change_notifications(
        ticket=updated_ticket,
        actor=actor,
        old_status=old_status,
        new_status=new_status,
        note=note,
    )
    return updated_ticket


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------

def assign_ticket(
    db: Session,
    *,
    ticket: Ticket,
    agent_id: uuid.UUID | None,
    agent: object,  # User object – validated by caller
) -> Ticket:
    return ticket_repo.assign_ticket(db, ticket, agent_id)


def update_category(db: Session, *, ticket: Ticket, category) -> Ticket:
    if ticket_repo.get_active_ticket_category(db, category) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ticket category is not available",
        )
    return ticket_repo.update_ticket_category(db, ticket, category)


# ---------------------------------------------------------------------------
# Scheduled maintenance
# ---------------------------------------------------------------------------

def auto_close_stale_tickets(db: Session) -> int:
    """Close resolved tickets older than 7 days. Returns count closed."""
    return ticket_repo.auto_close_stale_tickets(db)
