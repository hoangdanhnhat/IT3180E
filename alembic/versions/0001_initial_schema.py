"""Initial schema — all tables, enums, GIN indexes, tsvector triggers

Revision ID: 0001
Revises:
Create Date: 2026-03-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Enum types
    # ------------------------------------------------------------------
    userrole = postgresql.ENUM("customer", "agent", "admin", name="userrole")
    ticketcategory = postgresql.ENUM(
        "billing", "delays", "lost_found", "route", "other", name="ticketcategory"
    )
    ticketpriority = postgresql.ENUM("low", "normal", "high", "urgent", name="ticketpriority")
    ticketstatus = postgresql.ENUM(
        "open", "in_progress", "pending_customer", "resolved", "closed", name="ticketstatus"
    )
    userrole.create(op.get_bind(), checkfirst=True)
    ticketcategory.create(op.get_bind(), checkfirst=True)
    ticketpriority.create(op.get_bind(), checkfirst=True)
    ticketstatus.create(op.get_bind(), checkfirst=True)

    # ------------------------------------------------------------------
    # users
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column(
            "role",
            postgresql.ENUM("customer", "agent", "admin", name="userrole", create_type=False),
            nullable=False,
            server_default="customer",
        ),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ------------------------------------------------------------------
    # tickets
    # ------------------------------------------------------------------
    op.create_table(
        "tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_number", sa.String(20), nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "assigned_to",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column(
            "category",
            postgresql.ENUM("billing", "delays", "lost_found", "route", "other", name="ticketcategory", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "priority",
            postgresql.ENUM("low", "normal", "high", "urgent", name="ticketpriority", create_type=False),
            nullable=False,
            server_default="normal",
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "open", "in_progress", "pending_customer", "resolved", "closed",
                name="ticketstatus", create_type=False,
            ),
            nullable=False,
            server_default="open",
        ),
        sa.Column("is_public", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("search_vector", postgresql.TSVECTOR, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_tickets_ticket_number", "tickets", ["ticket_number"], unique=True)
    op.create_index(
        "ix_tickets_search_vector", "tickets", ["search_vector"], postgresql_using="gin"
    )

    # ------------------------------------------------------------------
    # faq_items
    # ------------------------------------------------------------------
    op.create_table(
        "faq_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("question", sa.String(500), nullable=False),
        sa.Column("answer", sa.Text, nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.String), nullable=True),
        sa.Column("view_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("search_vector", postgresql.TSVECTOR, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_faq_items_search_vector", "faq_items", ["search_vector"], postgresql_using="gin"
    )

    # ------------------------------------------------------------------
    # ticket_messages
    # ------------------------------------------------------------------
    op.create_table(
        "ticket_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("is_internal", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ------------------------------------------------------------------
    # attachments
    # ------------------------------------------------------------------
    op.create_table(
        "attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ticket_messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer, nullable=False),
    )

    # ------------------------------------------------------------------
    # ticket_status_history
    # ------------------------------------------------------------------
    op.create_table(
        "ticket_status_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "changed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "old_status",
            postgresql.ENUM(
                "open", "in_progress", "pending_customer", "resolved", "closed",
                name="ticketstatus", create_type=False,
            ),
            nullable=True,
        ),
        sa.Column(
            "new_status",
            postgresql.ENUM(
                "open", "in_progress", "pending_customer", "resolved", "closed",
                name="ticketstatus", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ------------------------------------------------------------------
    # PostgreSQL tsvector trigger: tickets
    # ------------------------------------------------------------------
    op.execute("""
        CREATE OR REPLACE FUNCTION tickets_tsvector_update()
        RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', coalesce(NEW.subject, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER tickets_tsvector_trigger
            BEFORE INSERT OR UPDATE OF subject, description
            ON tickets
            FOR EACH ROW EXECUTE FUNCTION tickets_tsvector_update();
    """)

    # ------------------------------------------------------------------
    # PostgreSQL tsvector trigger: faq_items
    # ------------------------------------------------------------------
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
        CREATE TRIGGER faq_items_tsvector_trigger
            BEFORE INSERT OR UPDATE OF question, answer
            ON faq_items
            FOR EACH ROW EXECUTE FUNCTION faq_items_tsvector_update();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS faq_items_tsvector_trigger ON faq_items")
    op.execute("DROP FUNCTION IF EXISTS faq_items_tsvector_update")
    op.execute("DROP TRIGGER IF EXISTS tickets_tsvector_trigger ON tickets")
    op.execute("DROP FUNCTION IF EXISTS tickets_tsvector_update")

    op.drop_table("ticket_status_history")
    op.drop_table("attachments")
    op.drop_table("ticket_messages")
    op.drop_table("faq_items")
    op.drop_table("tickets")
    op.drop_table("users")

    for enum_name in ("ticketstatus", "ticketpriority", "ticketcategory", "userrole"):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
