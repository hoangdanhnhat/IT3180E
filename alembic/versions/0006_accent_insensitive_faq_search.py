"""Add accent-insensitive FAQ search

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-03
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("""
        CREATE OR REPLACE FUNCTION faq_items_tsvector_update()
        RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', coalesce(NEW.question, '')), 'A') ||
                setweight(to_tsvector('simple', unaccent(coalesce(NEW.question, ''))), 'A') ||
                setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'A') ||
                setweight(to_tsvector('simple', unaccent(coalesce(array_to_string(NEW.tags, ' '), ''))), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.category, '')), 'B') ||
                setweight(to_tsvector('simple', unaccent(coalesce(NEW.category, ''))), 'B') ||
                setweight(to_tsvector('english', coalesce(NEW.answer, '')), 'C') ||
                setweight(to_tsvector('simple', unaccent(coalesce(NEW.answer, ''))), 'C');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        UPDATE faq_items
        SET search_vector =
            setweight(to_tsvector('english', coalesce(question, '')), 'A') ||
            setweight(to_tsvector('simple', unaccent(coalesce(question, ''))), 'A') ||
            setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'A') ||
            setweight(to_tsvector('simple', unaccent(coalesce(array_to_string(tags, ' '), ''))), 'A') ||
            setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
            setweight(to_tsvector('simple', unaccent(coalesce(category, ''))), 'B') ||
            setweight(to_tsvector('english', coalesce(answer, '')), 'C') ||
            setweight(to_tsvector('simple', unaccent(coalesce(answer, ''))), 'C')
    """)


def downgrade() -> None:
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
