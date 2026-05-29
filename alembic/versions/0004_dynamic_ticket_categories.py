"""Use admin-managed ticket categories

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


DEFAULT_CATEGORIES = (
    ("billing", "Billing & Payments"),
    ("delays", "Delays & Cancellations"),
    ("lost_found", "Lost & Found"),
    ("route", "Route Enquiry"),
    ("other", "Other"),
)


def upgrade() -> None:
    op.create_table(
        "ticket_categories",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    categories_table = sa.table(
        "ticket_categories",
        sa.column("key", sa.String),
        sa.column("label", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        categories_table,
        [{"key": key, "label": label, "is_active": True} for key, label in DEFAULT_CATEGORIES],
    )

    op.alter_column(
        "tickets",
        "category",
        existing_type=sa.Enum(
            "billing", "delays", "lost_found", "route", "other", name="ticketcategory"
        ),
        type_=sa.String(100),
        existing_nullable=False,
        postgresql_using="category::text",
    )
    op.execute("DROP TYPE IF EXISTS ticketcategory")


def downgrade() -> None:
    op.execute(
        "CREATE TYPE ticketcategory AS ENUM "
        "('billing', 'delays', 'lost_found', 'route', 'other')"
    )
    op.alter_column(
        "tickets",
        "category",
        existing_type=sa.String(100),
        type_=sa.Enum(
            "billing", "delays", "lost_found", "route", "other", name="ticketcategory"
        ),
        existing_nullable=False,
        postgresql_using="category::ticketcategory",
    )
    op.drop_table("ticket_categories")
