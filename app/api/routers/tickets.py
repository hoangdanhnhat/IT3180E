"""Ticket CRUD endpoints.

Endpoints
---------
POST   /tickets                       Customer   — submit a new ticket
GET    /tickets                       Customer   — list own tickets
GET    /tickets/public                Public     — browse public resolved tickets
GET    /tickets/{id}                  Customer / Agent — get ticket detail + messages
POST   /tickets/{id}/messages         Customer / Agent — add reply or internal note
POST   /tickets/{id}/attachments      Customer / Agent — upload file attachments
PATCH  /tickets/{id}/status           Agent      — change ticket status
PATCH  /tickets/{id}/assign           Agent      — assign ticket to an agent
"""

import os
import uuid

from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_current_user,
    require_agent_or_admin,
)
from app.api.schemas import (
    AssignUpdate,
    AttachmentOut,
    MessageCreate,
    MessageOut,
    PublicTicketOut,
    StatusUpdate,
    TicketCreate,
    TicketDetail,
    TicketOut,
)
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import ForbiddenException, NotFoundException
from app.services import ticket_service
from app.storage import ticket_repo, user_repo
from app.storage.models import User, UserRole

_ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
}
_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}

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
# Customer / Agent — upload attachments
# ---------------------------------------------------------------------------

@router.post("/{ticket_id}/attachments", response_model=AttachmentOut, status_code=201)
async def upload_attachment(
    ticket_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file attachment (image or PDF, max 10 MB) to a ticket."""
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)

    is_agent_or_admin = current_user.role in (UserRole.agent, UserRole.admin)
    if not is_agent_or_admin and ticket.user_id != current_user.id:
        raise ForbiddenException("You do not have access to this ticket")

    # Validate extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only JPEG, PNG, GIF, WEBP, and PDF files are allowed",
        )

    # Read and validate size
    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the 10 MB limit",
        )

    # Validate mime type from content-type header (best-effort)
    mime = (file.content_type or "").split(";")[0].strip()
    if mime and mime not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File type not permitted",
        )

    # Build a safe storage filename: {ticket_id}_{random_uuid}{ext}
    safe_name = f"{ticket_id}_{uuid.uuid4().hex}{ext}"
    dest = os.path.join(settings.UPLOAD_DIR, safe_name)
    with open(dest, "wb") as f:
        f.write(contents)

    attachment = ticket_repo.create_attachment(
        db,
        ticket_id=ticket_id,
        filename=file.filename or safe_name,
        storage_path=safe_name,
        mime_type=mime or "application/octet-stream",
        file_size=len(contents),
    )

    return AttachmentOut(
        id=attachment.id,
        ticket_id=attachment.ticket_id,
        filename=attachment.filename,
        mime_type=attachment.mime_type,
        file_size=attachment.file_size,
        url=f"/uploads/{safe_name}",
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
