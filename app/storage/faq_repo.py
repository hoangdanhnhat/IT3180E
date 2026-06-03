"""Low-level database access for FAQ items."""

import re
import unicodedata
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.storage.models import FaqItem, FaqUpvote


# ---------------------------------------------------------------------------
# Hybrid search: PostgreSQL full-text rank + fuzzy pg_trgm similarity
# ---------------------------------------------------------------------------

_SEARCH_TOKEN_RE = re.compile(r"[^\W_]+(?:'[^\W_]+)?", re.IGNORECASE)


def _strip_accents(value: str) -> str:
    """Normalize Vietnamese accents for accent-insensitive search prefixes."""
    normalized = unicodedata.normalize(
        "NFKD",
        value.replace("đ", "d").replace("Đ", "D"),
    )
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def _make_prefix_tsquery(q: str) -> str | None:
    """Build a safe prefix tsquery string for partial-word FAQ searches."""
    tokens = _SEARCH_TOKEN_RE.findall(_strip_accents(q).lower())
    if not tokens:
        return None
    return " & ".join(f"{token}:*" for token in tokens)


_HYBRID_SQL = text("""
WITH search_input AS (
    SELECT
        websearch_to_tsquery('english', :q) AS web_query,
        websearch_to_tsquery('simple', unaccent(:q)) AS unaccent_query,
        lower(unaccent(:q)) AS unaccent_q,
        CASE
            WHEN :prefix_q IS NULL THEN NULL::tsquery
            ELSE to_tsquery('simple', :prefix_q)
        END AS prefix_query
),
scored AS (
    SELECT
        faq_items.id,
        ts_rank_cd(faq_items.search_vector, search_input.web_query, 32) AS web_rank,
        ts_rank_cd(faq_items.search_vector, search_input.unaccent_query, 32) AS unaccent_rank,
        CASE
            WHEN search_input.prefix_query IS NULL THEN 0.0
            ELSE ts_rank_cd(faq_items.search_vector, search_input.prefix_query, 32)
        END AS prefix_rank,
        GREATEST(
            similarity(faq_items.question, :q),
            similarity(faq_items.answer, :q),
            similarity(faq_items.category, :q),
            similarity(coalesce(array_to_string(faq_items.tags, ' '), ''), :q),
            similarity(lower(unaccent(faq_items.question)), search_input.unaccent_q),
            similarity(lower(unaccent(faq_items.answer)), search_input.unaccent_q),
            similarity(lower(unaccent(faq_items.category)), search_input.unaccent_q),
            similarity(
                lower(unaccent(coalesce(array_to_string(faq_items.tags, ' '), ''))),
                search_input.unaccent_q
            )
        ) AS fuzzy_score,
        CASE
            WHEN length(search_input.unaccent_q) < 4 THEN 0.0
            ELSE GREATEST(
                word_similarity(search_input.unaccent_q, lower(unaccent(faq_items.question))),
                word_similarity(search_input.unaccent_q, lower(unaccent(faq_items.answer))),
                word_similarity(search_input.unaccent_q, lower(unaccent(faq_items.category))),
                word_similarity(
                    search_input.unaccent_q,
                    lower(unaccent(coalesce(array_to_string(faq_items.tags, ' '), '')))
                )
            )
        END AS phrase_typo_score,
        (
            SELECT COALESCE(avg(token_scores.best_score), 0.0)
            FROM (
                SELECT GREATEST(
                    word_similarity(token.value, lower(unaccent(faq_items.question))),
                    word_similarity(token.value, lower(unaccent(faq_items.answer))),
                    word_similarity(token.value, lower(unaccent(faq_items.category))),
                    word_similarity(
                        token.value,
                        lower(unaccent(coalesce(array_to_string(faq_items.tags, ' '), '')))
                    )
                ) AS best_score
                FROM regexp_split_to_table(search_input.unaccent_q, '[[:space:]]+') AS token(value)
                WHERE length(token.value) >= 4
            ) AS token_scores
        ) AS token_typo_score,
        CASE
            WHEN faq_items.question ILIKE :pattern THEN 1.0
            WHEN lower(unaccent(faq_items.question)) ILIKE :unaccent_pattern THEN 1.0
            WHEN faq_items.category ILIKE :pattern THEN 0.7
            WHEN lower(unaccent(faq_items.category)) ILIKE :unaccent_pattern THEN 0.7
            WHEN coalesce(array_to_string(faq_items.tags, ' '), '') ILIKE :pattern THEN 0.6
            WHEN lower(unaccent(coalesce(array_to_string(faq_items.tags, ' '), ''))) ILIKE :unaccent_pattern THEN 0.6
            WHEN faq_items.answer ILIKE :pattern THEN 0.35
            WHEN lower(unaccent(faq_items.answer)) ILIKE :unaccent_pattern THEN 0.35
            ELSE 0.0
        END AS exact_boost,
        (ln(faq_items.upvote_count + 1) * 0.04 + ln(faq_items.view_count + 1) * 0.01) AS usage_boost
    FROM faq_items
    CROSS JOIN search_input
    WHERE
        faq_items.is_active = TRUE
        AND (:category IS NULL OR faq_items.category = :category)
)
SELECT
    faq_items.id,
    (
        scored.web_rank * 4.0
        + scored.unaccent_rank * 4.0
        + scored.prefix_rank * 2.5
        + scored.fuzzy_score * 1.2
        + scored.phrase_typo_score * 1.5
        + scored.token_typo_score
        + scored.exact_boost
        + scored.usage_boost
    ) AS score
FROM scored
JOIN faq_items ON faq_items.id = scored.id
WHERE scored.phrase_typo_score >= :phrase_typo_threshold
   OR scored.token_typo_score >= :token_typo_threshold
   OR (
        scored.web_rank > 0
        OR scored.unaccent_rank > 0
        OR scored.prefix_rank > 0
        OR scored.fuzzy_score >= :fuzzy_threshold
        OR scored.exact_boost > 0
   )
ORDER BY score DESC, faq_items.upvote_count DESC, faq_items.created_at DESC
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
    - PostgreSQL full-text ranking for exact and partial-word matches
    - Fuzzy matching via pg_trgm similarity (typo-tolerant)
    - Small usage boost from upvotes/views after relevance is established

    Results are ranked by relevance first, with popularity used as a boost/tiebreaker.
    Returns hydrated FaqItem ORM objects.
    """
    q = " ".join(q.split())
    pattern = f"%{q}%"
    unaccent_pattern = f"%{_strip_accents(q).lower()}%"
    rows = db.execute(
        _HYBRID_SQL,
        {
            "q": q,
            "prefix_q": _make_prefix_tsquery(q),
            "category": category,
            "pattern": pattern,
            "unaccent_pattern": unaccent_pattern,
            "fuzzy_threshold": 0.25,
            "phrase_typo_threshold": 0.45,
            "token_typo_threshold": 0.55,
            "limit": limit,
        },
    ).fetchall()

    if not rows:
        return []

    # Preserve the SQL-ranked order
    id_to_rank = {row.id: idx for idx, row in enumerate(rows)}
    ordered_ids = [row.id for row in rows]

    faqs = (
        db.query(FaqItem)
        .filter(FaqItem.id.in_(ordered_ids))
        .all()
    )
    # Re-sort to match the SQL order (IN clause doesn't guarantee order)
    faqs.sort(key=lambda f: id_to_rank.get(f.id, len(id_to_rank)))
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

    return query.order_by(FaqItem.upvote_count.desc(), FaqItem.created_at.desc()).all()


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


def get_faq_upvotes_for_user(
    db: Session,
    *,
    faq_ids: list[uuid.UUID],
    user_id: uuid.UUID | None,
) -> set[uuid.UUID]:
    if not faq_ids or user_id is None:
        return set()

    rows = (
        db.query(FaqUpvote.faq_id)
        .filter(FaqUpvote.user_id == user_id, FaqUpvote.faq_id.in_(faq_ids))
        .all()
    )
    return {row[0] for row in rows}


def has_user_upvoted(db: Session, *, faq_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return (
        db.query(FaqUpvote.id)
        .filter(FaqUpvote.faq_id == faq_id, FaqUpvote.user_id == user_id)
        .first()
        is not None
    )


def upvote_faq(db: Session, *, faq: FaqItem, user_id: uuid.UUID) -> FaqItem:
    if has_user_upvoted(db, faq_id=faq.id, user_id=user_id):
        setattr(faq, "has_upvoted", True)
        return faq

    db.add(FaqUpvote(faq_id=faq.id, user_id=user_id))
    faq.upvote_count = (faq.upvote_count or 0) + 1
    db.commit()
    db.refresh(faq)
    setattr(faq, "has_upvoted", True)
    return faq


def remove_faq_upvote(db: Session, *, faq: FaqItem, user_id: uuid.UUID) -> FaqItem:
    vote = (
        db.query(FaqUpvote)
        .filter(FaqUpvote.faq_id == faq.id, FaqUpvote.user_id == user_id)
        .first()
    )
    if vote is None:
        setattr(faq, "has_upvoted", False)
        return faq

    db.delete(vote)
    faq.upvote_count = max((faq.upvote_count or 0) - 1, 0)
    db.commit()
    db.refresh(faq)
    setattr(faq, "has_upvoted", False)
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


def create_faqs(db: Session, items: list[dict]) -> list[FaqItem]:
    faqs = [
        FaqItem(
            question=item["question"],
            answer=item["answer"],
            category=item["category"],
            tags=item.get("tags") or [],
            is_active=item.get("is_active", True),
        )
        for item in items
    ]
    db.add_all(faqs)
    db.commit()
    for faq in faqs:
        db.refresh(faq)
    return faqs


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
