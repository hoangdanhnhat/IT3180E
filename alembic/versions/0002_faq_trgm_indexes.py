"""Enable pg_trgm extension and add trigram GIN indexes on faq_items

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-30
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable the pg_trgm extension (ships with every PostgreSQL install)
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # GIN trigram indexes allow fast fuzzy/ILIKE queries on question and answer
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_faq_question_trgm "
        "ON faq_items USING GIN (question gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_faq_answer_trgm "
        "ON faq_items USING GIN (answer gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_faq_answer_trgm")
    op.execute("DROP INDEX IF EXISTS ix_faq_question_trgm")
    # Do NOT drop pg_trgm extension — it may be used by other objects
