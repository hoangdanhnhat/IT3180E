"""Agent portal endpoints.

Endpoints
---------
GET  /agent/tickets             Agent / Admin — list tickets assigned to current agent
GET  /agent/tickets/{ticket_id} Agent / Admin — get full detail of an assigned ticket
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import require_agent_or_admin
from app.api.schemas import TicketDetail, TicketOut
from app.core.db import get_db
from app.core.exceptions import ForbiddenException
from app.services import ticket_service
from app.storage.models import User, UserRole

router = APIRouter(prefix="/agent", tags=["agent"])


# ---------------------------------------------------------------------------
# Agent — list assigned tickets
# ---------------------------------------------------------------------------

@router.get("/tickets", response_model=list[TicketOut])
def list_assigned_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Return all tickets assigned to the authenticated agent (or all for admins)."""
    return ticket_service.list_assigned_tickets(db, current_user.id)


# ---------------------------------------------------------------------------
# Agent — get ticket detail
# ---------------------------------------------------------------------------

@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
def get_assigned_ticket(
    ticket_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
):
    """Return full ticket detail.

    Agents may only view tickets assigned to them.
    Admins may view any ticket.
    """
    ticket = ticket_service.get_ticket_or_404(db, ticket_id)

    if (
        current_user.role == UserRole.agent
        and ticket.assigned_to != current_user.id
    ):
        raise ForbiddenException("You can only view tickets assigned to you")

    return ticket
