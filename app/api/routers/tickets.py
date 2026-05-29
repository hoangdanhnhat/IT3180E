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
PATCH  /tickets/{id}/follow           Agent      — follow/claim ticket as current staff user
PATCH  /tickets/{id}/category         Agent      — transfer ticket to another category
"""

import os
import uuid

from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
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
    PublicAttachmentOut,
    PublicMessageOut,
    PublicTicketDetail,
    PublicTicketOut,
    StatusUpdate,
    TicketCategoryUpdate,
    TicketCategoryOut,
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
    category: str | None = Query(default=None, description="Category filter"),
    db: Session = Depends(get_db),
):
    """Return resolved public tickets. Optionally filter by keyword and/or category."""
    return ticket_service.list_public_tickets(db, q, category)


@router.get("/categories", response_model=list[TicketCategoryOut])
def list_ticket_categories(db: Session = Depends(get_db)):
    """Return active ticket categories for forms and filters."""
    return ticket_repo.list_ticket_categories(db)


@router.get("/public/{ticket_number}", response_model=PublicTicketDetail)
def get_public_ticket(ticket_number: str, db: Session = Depends(get_db)):
    """Return detail of a single public ticket including its non-internal messages."""
    ticket = ticket_repo.get_public_ticket_by_number(db, ticket_number)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    orm_messages = list(ticket.messages)
    orm_attachments = list(ticket.attachments)
    ticket.messages = []
    ticket.attachments = []
    detail = PublicTicketDetail.model_validate(ticket)
    ticket.messages = orm_messages
    ticket.attachments = orm_attachments

    detail.messages = [PublicMessageOut.from_orm_message(m) for m in orm_messages]
    detail.attachments = [
        PublicAttachmentOut(
            id=a.id,
            filename=a.filename,
            mime_type=a.mime_type,
            file_size=a.file_size,
            url=f"/api/v1/tickets/public/{ticket_number}/attachments/{a.id}/download",
        )
        for a in orm_attachments
    ]
    return detail


@router.get("/public/{ticket_number}/attachments/{attachment_id}/download")
def download_public_attachment(
    ticket_number: str,
    attachment_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Download an attachment from a public ticket. No authentication required."""
    ticket = ticket_repo.get_public_ticket_by_number(db, ticket_number)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    attachment = next((a for a in ticket.attachments if a.id == attachment_id), None)
    if attachment is None:
        raise NotFoundException("Attachment not found")

    file_path = os.path.join(settings.UPLOAD_DIR, attachment.storage_path)
    if not os.path.isfile(file_path):
        raise NotFoundException("Attachment file not found on disk")

    return FileResponse(
        path=file_path,
        media_type=attachment.mime_type,
        filename=attachment.filename,
    )


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

    # Build TicketDetail with attachment URLs.
    # model_validate would fail on ORM Attachment objects (no `url` column),
    # so we hide them before validation and inject the enriched DTOs after.
    orm_attachments = list(ticket.attachments)
    ticket.attachments = []

    detail = TicketDetail.model_validate(ticket)

    ticket.attachments = orm_attachments  # restore (keeps session state clean)
    detail.attachments = [
        AttachmentOut(
            id=a.id,
            ticket_id=a.ticket_id,
            filename=a.filename,
            mime_type=a.mime_type,
            file_size=a.file_size,
            url=f"/api/v1/tickets/{ticket_id}/attachments/{a.id}/download",
        )
        for a in orm_attachments
    ]
    return detail


# ---------------------------------------------------------------------------
# Customer / Agent — download attachment (secure)
# ---------------------------------------------------------------------------

@router.get("/{ticket_id}/attachments/{attachment_id}/download")
def download_attachment(
    ticket_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download an attachment. Only the submitter or staff may access."""
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)

    is_staff = current_user.role in (UserRole.agent, UserRole.admin)
    is_submitter = ticket.user_id == current_user.id

    if not (is_staff or is_submitter):
        raise ForbiddenException("You do not have access to this attachment")

    attachment = next((a for a in ticket.attachments if a.id == attachment_id), None)
    if attachment is None:
        raise NotFoundException("Attachment not found")

    file_path = os.path.join(settings.UPLOAD_DIR, attachment.storage_path)
    if not os.path.isfile(file_path):
        raise NotFoundException("Attachment file not found on disk")

    return FileResponse(
        path=file_path,
        media_type=attachment.mime_type,
        filename=attachment.filename,
    )


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
# Customer / Agent — change ticket status
# ---------------------------------------------------------------------------

@router.patch("/{ticket_id}/status", response_model=TicketOut)
def update_status(
    ticket_id: uuid.UUID,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transition a ticket to a new status.

    - Agents/admins may perform agent-role transitions on their assigned tickets.
    - Customers may close or reopen (resolved → closed/open) their own tickets.
    - Invalid transitions are rejected with **422 Unprocessable Entity**.
    """
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)

    is_agent_or_admin = current_user.role in (UserRole.agent, UserRole.admin)

    if is_agent_or_admin:
        if current_user.role == UserRole.agent and ticket.assigned_to != current_user.id:
            raise ForbiddenException("You can only update the status of tickets assigned to you")
    else:
        # Customer: may only act on their own tickets
        if ticket.user_id != current_user.id:
            raise ForbiddenException("You do not have access to this ticket")

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

    if body.agent_id is None:
        return ticket_service.assign_ticket(db, ticket=ticket, agent_id=None, agent=None)

    agent = user_repo.get_user_by_id(db, body.agent_id)
    if agent is None or agent.role not in (UserRole.agent, UserRole.admin):
        raise NotFoundException("Agent not found or user is not an agent")

    return ticket_service.assign_ticket(db, ticket=ticket, agent_id=body.agent_id, agent=agent)


@router.patch("/{ticket_id}/follow", response_model=TicketOut)
def follow_ticket(
    ticket_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Follow/claim a ticket as the authenticated staff user."""
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)
    return ticket_service.assign_ticket(
        db,
        ticket=ticket,
        agent_id=current_user.id,
        agent=current_user,
    )


@router.patch("/{ticket_id}/category", response_model=TicketOut)
def transfer_ticket_category(
    ticket_id: uuid.UUID,
    body: TicketCategoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_agent_or_admin),
):
    """Transfer a ticket to another category."""
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)
    return ticket_service.update_category(db, ticket=ticket, category=body.category)
