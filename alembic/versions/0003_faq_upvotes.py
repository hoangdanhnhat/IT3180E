"""Add FAQ upvotes

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "faq_items",
        sa.Column("upvote_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "faq_upvotes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "faq_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("faq_items.id", ondelete="CASCADE"),
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
        sa.UniqueConstraint("faq_id", "user_id", name="uq_faq_upvotes_faq_user"),
    )
    op.create_index("ix_faq_upvotes_faq_id", "faq_upvotes", ["faq_id"])
    op.create_index("ix_faq_upvotes_user_id", "faq_upvotes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_faq_upvotes_user_id", table_name="faq_upvotes")
    op.drop_index("ix_faq_upvotes_faq_id", table_name="faq_upvotes")
    op.drop_table("faq_upvotes")
    op.drop_column("faq_items", "upvote_count")
