import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class UserRole(str, PyEnum):
    customer = "customer"
    agent = "agent"
    admin = "admin"


class TicketCategory(str, PyEnum):
    billing = "billing"
    delays = "delays"
    lost_found = "lost_found"
    route = "route"
    other = "other"


class TicketPriority(str, PyEnum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class TicketStatus(str, PyEnum):
    open = "open"
    in_progress = "in_progress"
    pending_customer = "pending_customer"
    resolved = "resolved"
    closed = "closed"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="userrole"), nullable=False, default=UserRole.customer
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    submitted_tickets: Mapped[list["Ticket"]] = relationship(
        "Ticket", foreign_keys="Ticket.user_id", back_populates="submitter"
    )
    assigned_tickets: Mapped[list["Ticket"]] = relationship(
        "Ticket", foreign_keys="Ticket.assigned_to", back_populates="assignee"
    )
    messages: Mapped[list["TicketMessage"]] = relationship(
        "TicketMessage", back_populates="sender"
    )
    status_changes: Mapped[list["TicketStatusHistory"]] = relationship(
        "TicketStatusHistory", back_populates="changed_by_user"
    )


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[TicketCategory] = mapped_column(
        Enum(TicketCategory, name="ticketcategory"), nullable=False
    )
    priority: Mapped[TicketPriority] = mapped_column(
        Enum(TicketPriority, name="ticketpriority"), nullable=False, default=TicketPriority.normal
    )
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, name="ticketstatus"), nullable=False, default=TicketStatus.open
    )
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Populated and kept up to date by a PostgreSQL trigger (see migration)
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    submitter: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="submitted_tickets"
    )
    assignee: Mapped["User | None"] = relationship(
        "User", foreign_keys=[assigned_to], back_populates="assigned_tickets"
    )
    messages: Mapped[list["TicketMessage"]] = relationship(
        "TicketMessage", back_populates="ticket", cascade="all, delete-orphan"
    )
    attachments: Mapped[list["Attachment"]] = relationship(
        "Attachment", back_populates="ticket", cascade="all, delete-orphan"
    )
    status_history: Mapped[list["TicketStatusHistory"]] = relationship(
        "TicketStatusHistory", back_populates="ticket", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_tickets_search_vector", "search_vector", postgresql_using="gin"),
    )


class FaqItem(Base):
    __tablename__ = "faq_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    question: Mapped[str] = mapped_column(String(500), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True, default=list)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Populated and kept up to date by a PostgreSQL trigger (see migration)
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_faq_items_search_vector", "search_vector", postgresql_using="gin"),
    )


class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="messages")
    sender: Mapped["User"] = relationship("User", back_populates="messages")
    attachments: Mapped[list["Attachment"]] = relationship(
        "Attachment", back_populates="message"
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ticket_messages.id", ondelete="SET NULL"), nullable=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="attachments")
    message: Mapped["TicketMessage | None"] = relationship(
        "TicketMessage", back_populates="attachments"
    )


class TicketStatusHistory(Base):
    __tablename__ = "ticket_status_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False
    )
    changed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    old_status: Mapped[TicketStatus | None] = mapped_column(
        Enum(TicketStatus, name="ticketstatus"), nullable=True
    )
    new_status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, name="ticketstatus"), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="status_history")
    changed_by_user: Mapped["User"] = relationship("User", back_populates="status_changes")
