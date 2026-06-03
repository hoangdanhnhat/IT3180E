"""Improve FAQ search vector weighting

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-03
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_faq_category_trgm "
        "ON faq_items USING GIN (category gin_trgm_ops)"
    )
    op.execute("""
        CREATE OR REPLACE FUNCTION faq_items_tsvector_update()
        RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', coalesce(NEW.question, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.category, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(NEW.answer, '')), 'C');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        UPDATE faq_items
        SET search_vector =
            setweight(to_tsvector('english', coalesce(question, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'A') ||
            setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(answer, '')), 'C')
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS faq_items_tsvector_trigger ON faq_items
    """)
    op.execute("""
        CREATE TRIGGER faq_items_tsvector_trigger
            BEFORE INSERT OR UPDATE OF question, answer, category, tags
            ON faq_items
            FOR EACH ROW EXECUTE FUNCTION faq_items_tsvector_update();
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_faq_category_trgm")
    op.execute("""
        CREATE OR REPLACE FUNCTION faq_items_tsvector_update()
        RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', coalesce(NEW.question, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.answer, '')), 'B');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        UPDATE faq_items
        SET search_vector =
            setweight(to_tsvector('english', coalesce(question, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(answer, '')), 'B')
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS faq_items_tsvector_trigger ON faq_items
    """)
    op.execute("""
        CREATE TRIGGER faq_items_tsvector_trigger
            BEFORE INSERT OR UPDATE OF question, answer
            ON faq_items
            FOR EACH ROW EXECUTE FUNCTION faq_items_tsvector_update();
    """)
