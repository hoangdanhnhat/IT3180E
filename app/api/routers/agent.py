"""Agent portal endpoints.

Endpoints
---------
GET  /agent/tickets             Agent / Admin — list tickets visible to staff
GET  /agent/tickets/{ticket_id} Agent / Admin — get full ticket detail
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import require_agent_or_admin
from app.api.schemas import TicketDetail, TicketOut
from app.core.db import get_db
from app.services import ticket_service
from app.storage.models import TicketCategory, User

router = APIRouter(prefix="/agent", tags=["agent"])


# ---------------------------------------------------------------------------
# Agent — list staff-visible tickets
# ---------------------------------------------------------------------------

@router.get("/tickets", response_model=list[TicketOut])
def list_staff_tickets(
    category: TicketCategory | None = Query(default=None, description="Category filter"),
    db: Session = Depends(get_db),
    _: User = Depends(require_agent_or_admin),
):
    """Return all tickets visible to staff, optionally filtered by category."""
    return ticket_service.list_staff_visible_tickets(db, category=category)


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

    All staff may inspect tickets before choosing whether to follow them.
    """
    return ticket_service.get_ticket_or_404(db, ticket_id)
