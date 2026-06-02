"""FAQ endpoints.

Endpoints
---------
GET    /faq                     Public      — list active FAQs (with search & category filter)
GET    /faq/categories          Public      — list distinct categories
GET    /faq/{id}                Public      — get detail + increment view_count
POST   /faq/{id}/upvote         User        — upvote an FAQ
DELETE /faq/{id}/upvote         User        — remove the user's FAQ upvote
POST   /faq                     Admin       — create a new FAQ item
PATCH  /faq/{id}                Admin       — partial update an FAQ item
DELETE /faq/{id}                Admin       — hard delete an FAQ item
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_optional_current_user, require_admin
from app.api.schemas import FaqCreate, FaqImportRequest, FaqImportResponse, FaqOut, FaqUpdate
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
    current_user: User | None = Depends(get_optional_current_user),
):
    """Return all active FAQ items. Supports keyword search and category filter."""
    return faq_service.list_faqs(
        db,
        q=q,
        category=category,
        include_inactive=False,
        viewer_id=current_user.id if current_user else None,
    )


# ---------------------------------------------------------------------------
# Public — list categories
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)):
    """Return a sorted list of distinct FAQ categories."""
    return faq_service.list_categories(db)


# ---------------------------------------------------------------------------
# Admin — import FAQs
# ---------------------------------------------------------------------------

@router.post("/import", response_model=FaqImportResponse, status_code=201)
def import_faqs(
    body: FaqImportRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Bulk import FAQ items from a validated JSON payload (admin only)."""
    items = [item.model_dump() for item in body.items]
    faqs = faq_service.import_faqs(db, items)
    return {"imported_count": len(faqs), "items": faqs}


# ---------------------------------------------------------------------------
# Public — get single FAQ (increments view_count)
# ---------------------------------------------------------------------------

@router.get("/{faq_id}", response_model=FaqOut)
def get_faq(
    faq_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    """Return FAQ detail and increment its view count."""
    return faq_service.get_faq_detail(
        db,
        faq_id,
        viewer_id=current_user.id if current_user else None,
    )


# ---------------------------------------------------------------------------
# User — upvote FAQ
# ---------------------------------------------------------------------------

@router.post("/{faq_id}/upvote", response_model=FaqOut)
def upvote_faq(
    faq_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upvote an FAQ once for the authenticated user."""
    return faq_service.upvote_faq(db, faq_id, current_user.id)


@router.delete("/{faq_id}/upvote", response_model=FaqOut)
def remove_faq_upvote(
    faq_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove the authenticated user's FAQ upvote."""
    return faq_service.remove_faq_upvote(db, faq_id, current_user.id)


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
