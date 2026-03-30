"""Low-level database access for FAQ items."""

import uuid

from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app.storage.models import FaqItem


# ---------------------------------------------------------------------------
# Hybrid search: BM25 (tsvector ts_rank) + Fuzzy (pg_trgm similarity)
# ---------------------------------------------------------------------------

_HYBRID_SQL = text("""
WITH bm25 AS (
    SELECT
        id,
        ts_rank(search_vector, plainto_tsquery('english', :q)) AS bm25_score
    FROM faq_items
    WHERE
        is_active = TRUE
        AND (:category IS NULL OR category = :category)
        AND search_vector @@ plainto_tsquery('english', :q)
),
fuzzy AS (
    SELECT
        id,
        GREATEST(
            similarity(question, :q),
            similarity(answer,   :q)
        ) AS fuzzy_score
    FROM faq_items
    WHERE
        is_active = TRUE
        AND (:category IS NULL OR category = :category)
        AND (
            question % :q
            OR answer  % :q
            OR question ILIKE :pattern
            OR answer   ILIKE :pattern
        )
),
combined AS (
    SELECT
        COALESCE(b.id, f.id)              AS id,
        COALESCE(b.bm25_score,  0.0)      AS bm25_score,
        COALESCE(f.fuzzy_score, 0.0)      AS fuzzy_score
    FROM bm25 b
    FULL OUTER JOIN fuzzy f ON b.id = f.id
)
SELECT id, (bm25_score + fuzzy_score) AS score
FROM   combined
ORDER  BY score DESC
LIMIT  :limit
""")


def hybrid_search_faqs(
    db: Session,
    q: str,
    *,
    category: str | None = None,
    limit: int = 50,
) -> list[FaqItem]:
    """
    Hybrid search combining:
    - BM25 via PostgreSQL tsvector/ts_rank (exact term matching with TF-IDF weighting)
    - Fuzzy matching via pg_trgm similarity (typo-tolerant)

    Results are ranked by the sum of both scores, highest first.
    Returns hydrated FaqItem ORM objects.
    """
    pattern = f"%{q}%"
    rows = db.execute(
        _HYBRID_SQL,
        {"q": q, "category": category, "pattern": pattern, "limit": limit},
    ).fetchall()

    if not rows:
        return []

    # Preserve the hybrid-ranked order
    id_to_score = {row.id: row.score for row in rows}
    ordered_ids = [row.id for row in rows]

    faqs = (
        db.query(FaqItem)
        .filter(FaqItem.id.in_(ordered_ids))
        .all()
    )
    # Re-sort to match the SQL order (IN clause doesn't guarantee order)
    faqs.sort(key=lambda f: id_to_score.get(f.id, 0), reverse=True)
    return faqs


# ---------------------------------------------------------------------------
# Plain listing (no search query)
# ---------------------------------------------------------------------------

def list_faqs(
    db: Session,
    *,
    category: str | None = None,
    include_inactive: bool = False,
) -> list[FaqItem]:
    """List FAQ items with optional category filter."""
    query = db.query(FaqItem)

    if not include_inactive:
        query = query.filter(FaqItem.is_active.is_(True))

    if category:
        query = query.filter(FaqItem.category == category)

    return query.order_by(FaqItem.created_at.desc()).all()


def list_categories(db: Session) -> list[str]:
    """Return distinct categories of active FAQ items."""
    rows = (
        db.query(FaqItem.category)
        .filter(FaqItem.is_active.is_(True))
        .distinct()
        .order_by(FaqItem.category)
        .all()
    )
    return [r[0] for r in rows]


# ---------------------------------------------------------------------------
# Single item
# ---------------------------------------------------------------------------

def get_faq_by_id(db: Session, faq_id: uuid.UUID) -> FaqItem | None:
    return db.query(FaqItem).filter(FaqItem.id == faq_id).first()


def increment_view_count(db: Session, faq: FaqItem) -> FaqItem:
    faq.view_count = (faq.view_count or 0) + 1
    db.commit()
    db.refresh(faq)
    return faq


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def create_faq(
    db: Session,
    *,
    question: str,
    answer: str,
    category: str,
    tags: list[str] | None = None,
    is_active: bool = True,
) -> FaqItem:
    faq = FaqItem(
        question=question,
        answer=answer,
        category=category,
        tags=tags or [],
        is_active=is_active,
    )
    db.add(faq)
    db.commit()
    db.refresh(faq)
    return faq


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

def update_faq(
    db: Session,
    faq: FaqItem,
    *,
    question: str | None = None,
    answer: str | None = None,
    category: str | None = None,
    tags: list[str] | None = None,
    is_active: bool | None = None,
) -> FaqItem:
    if question is not None:
        faq.question = question
    if answer is not None:
        faq.answer = answer
    if category is not None:
        faq.category = category
    if tags is not None:
        faq.tags = tags
    if is_active is not None:
        faq.is_active = is_active
    db.commit()
    db.refresh(faq)
    return faq


# ---------------------------------------------------------------------------
# Delete (hard)
# ---------------------------------------------------------------------------

def delete_faq(db: Session, faq: FaqItem) -> None:
    db.delete(faq)
    db.commit()
