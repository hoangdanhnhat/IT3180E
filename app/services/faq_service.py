"""Business logic for FAQ items."""

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.storage import faq_repo
from app.storage.models import FaqItem


def get_faq_or_404(db: Session, faq_id: uuid.UUID) -> FaqItem:
    faq = faq_repo.get_faq_by_id(db, faq_id)
    if faq is None:
        raise NotFoundException("FAQ item not found")
    return faq


def list_faqs(
    db: Session,
    *,
    q: str | None = None,
    category: str | None = None,
    include_inactive: bool = False,
    viewer_id: uuid.UUID | None = None,
) -> list[FaqItem]:
    """
    Return FAQ items.
    - If `q` is provided: hybrid BM25 + fuzzy search, always returns active only.
    - Otherwise: plain listing with optional category filter.
    """
    if q and q.strip():
        # Hybrid search always filters active-only and respects category
        faqs = faq_repo.hybrid_search_faqs(db, q.strip(), category=category)
    else:
        faqs = faq_repo.list_faqs(
            db,
            category=category,
            include_inactive=include_inactive,
        )

    voted_ids = faq_repo.get_faq_upvotes_for_user(
        db,
        faq_ids=[faq.id for faq in faqs],
        user_id=viewer_id,
    )
    for faq in faqs:
        setattr(faq, "has_upvoted", faq.id in voted_ids)
    return faqs


def list_categories(db: Session) -> list[str]:
    return faq_repo.list_categories(db)


def get_faq_detail(
    db: Session,
    faq_id: uuid.UUID,
    *,
    viewer_id: uuid.UUID | None = None,
) -> FaqItem:
    """Return FAQ and increment view count."""
    faq = get_faq_or_404(db, faq_id)
    faq = faq_repo.increment_view_count(db, faq)
    if viewer_id is not None:
        setattr(
            faq,
            "has_upvoted",
            faq_repo.has_user_upvoted(db, faq_id=faq.id, user_id=viewer_id),
        )
    return faq


def upvote_faq(db: Session, faq_id: uuid.UUID, user_id: uuid.UUID) -> FaqItem:
    faq = get_faq_or_404(db, faq_id)
    return faq_repo.upvote_faq(db, faq=faq, user_id=user_id)


def remove_faq_upvote(db: Session, faq_id: uuid.UUID, user_id: uuid.UUID) -> FaqItem:
    faq = get_faq_or_404(db, faq_id)
    return faq_repo.remove_faq_upvote(db, faq=faq, user_id=user_id)


def create_faq(
    db: Session,
    *,
    question: str,
    answer: str,
    category: str,
    tags: list[str] | None = None,
    is_active: bool = True,
) -> FaqItem:
    return faq_repo.create_faq(
        db,
        question=question,
        answer=answer,
        category=category,
        tags=tags,
        is_active=is_active,
    )


def update_faq(
    db: Session,
    faq_id: uuid.UUID,
    *,
    question: str | None = None,
    answer: str | None = None,
    category: str | None = None,
    tags: list[str] | None = None,
    is_active: bool | None = None,
) -> FaqItem:
    faq = get_faq_or_404(db, faq_id)
    return faq_repo.update_faq(
        db,
        faq,
        question=question,
        answer=answer,
        category=category,
        tags=tags,
        is_active=is_active,
    )


def delete_faq(db: Session, faq_id: uuid.UUID) -> None:
    faq = get_faq_or_404(db, faq_id)
    faq_repo.delete_faq(db, faq)
