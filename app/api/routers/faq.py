"""FAQ endpoints.

Endpoints
---------
GET    /faq                     Public      — list active FAQs (with search & category filter)
GET    /faq/categories          Public      — list distinct categories
GET    /faq/{id}                Public      — get detail + increment view_count
POST   /faq                     Admin       — create a new FAQ item
PATCH  /faq/{id}                Admin       — partial update an FAQ item
DELETE /faq/{id}                Admin       — hard delete an FAQ item
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import require_admin
from app.api.schemas import FaqCreate, FaqOut, FaqUpdate
from app.core.db import get_db
from app.services import faq_service
from app.storage.models import User

router = APIRouter(prefix="/faq", tags=["faq"])


# ---------------------------------------------------------------------------
# Public — list FAQs
# ---------------------------------------------------------------------------

@router.get("", response_model=list[FaqOut])
def list_faqs(
    q: str | None = Query(default=None, description="Full-text keyword search"),
    category: str | None = Query(default=None, description="Filter by category"),
    db: Session = Depends(get_db),
):
    """Return all active FAQ items. Supports keyword search and category filter."""
    return faq_service.list_faqs(db, q=q, category=category, include_inactive=False)


# ---------------------------------------------------------------------------
# Public — list categories
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)):
    """Return a sorted list of distinct FAQ categories."""
    return faq_service.list_categories(db)


# ---------------------------------------------------------------------------
# Public — get single FAQ (increments view_count)
# ---------------------------------------------------------------------------

@router.get("/{faq_id}", response_model=FaqOut)
def get_faq(faq_id: uuid.UUID, db: Session = Depends(get_db)):
    """Return FAQ detail and increment its view count."""
    return faq_service.get_faq_detail(db, faq_id)


# ---------------------------------------------------------------------------
# Admin — create FAQ
# ---------------------------------------------------------------------------

@router.post("", response_model=FaqOut, status_code=201)
def create_faq(
    body: FaqCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Create a new FAQ item (admin only)."""
    return faq_service.create_faq(
        db,
        question=body.question,
        answer=body.answer,
        category=body.category,
        tags=body.tags,
        is_active=body.is_active,
    )


# ---------------------------------------------------------------------------
# Admin — update FAQ
# ---------------------------------------------------------------------------

@router.patch("/{faq_id}", response_model=FaqOut)
def update_faq(
    faq_id: uuid.UUID,
    body: FaqUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Partially update an FAQ item (admin only). Send only fields you wish to change."""
    return faq_service.update_faq(
        db,
        faq_id,
        question=body.question,
        answer=body.answer,
        category=body.category,
        tags=body.tags,
        is_active=body.is_active,
    )


# ---------------------------------------------------------------------------
# Admin — delete FAQ
# ---------------------------------------------------------------------------

@router.delete("/{faq_id}", status_code=204)
def delete_faq(
    faq_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Hard delete an FAQ item (admin only)."""
    faq_service.delete_faq(db, faq_id)
