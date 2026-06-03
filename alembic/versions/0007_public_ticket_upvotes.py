"""Add public ticket upvotes

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("public_upvote_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "ticket_upvotes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("ticket_id", "user_id", name="uq_ticket_upvotes_ticket_user"),
    )
    op.create_index("ix_ticket_upvotes_ticket_id", "ticket_upvotes", ["ticket_id"])
    op.create_index("ix_ticket_upvotes_user_id", "ticket_upvotes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_ticket_upvotes_user_id", table_name="ticket_upvotes")
    op.drop_index("ix_ticket_upvotes_ticket_id", table_name="ticket_upvotes")
    op.drop_table("ticket_upvotes")
    op.drop_column("tickets", "public_upvote_count")
