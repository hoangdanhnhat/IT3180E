import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.storage.models import TicketPriority, TicketStatus, UserRole


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=1, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Tickets
# ---------------------------------------------------------------------------

class TicketCreate(BaseModel):
    subject: str = Field(..., max_length=255)
    description: str
    category: str = Field(..., max_length=100)
    priority: TicketPriority = TicketPriority.normal
    is_public: bool = False


class TicketOut(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    description: str
    category: str
    priority: TicketPriority
    status: TicketStatus
    is_public: bool
    user_id: uuid.UUID
    assigned_to: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserBrief(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    sender_id: uuid.UUID
    sender: UserBrief
    content: str
    is_internal: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class StatusHistoryOut(BaseModel):
    id: uuid.UUID
    old_status: TicketStatus | None
    new_status: TicketStatus
    note: str | None
    changed_by: uuid.UUID
    changed_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

class AttachmentOut(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    filename: str
    mime_type: str
    file_size: int
    url: str

    model_config = {"from_attributes": True}


class TicketDetail(TicketOut):
    submitter: UserBrief
    messages: list[MessageOut]
    status_history: list[StatusHistoryOut]
    attachments: list[AttachmentOut] = []


class MessageCreate(BaseModel):
    content: str
    is_internal: bool = False


class StatusUpdate(BaseModel):
    status: TicketStatus
    note: str | None = None


class AssignUpdate(BaseModel):
    agent_id: uuid.UUID | None = None


class TicketCategoryUpdate(BaseModel):
    category: str = Field(..., max_length=100)


class PriorityUpdate(BaseModel):
    priority: TicketPriority


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

class AdminCreateUser(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = UserRole.customer


class RoleUpdate(BaseModel):
    role: UserRole


class TicketBrief(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    status: TicketStatus
    priority: TicketPriority
    category: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UserAdminOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    ticket_count: int = 0

    model_config = {"from_attributes": True}


class TicketAdminListOut(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    category: str
    priority: TicketPriority
    status: TicketStatus
    is_public: bool
    user_id: uuid.UUID
    assigned_to: uuid.UUID | None
    submitter_name: str
    assignee_name: str | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Public tickets (no PII)
# ---------------------------------------------------------------------------

class PublicTicketOut(BaseModel):
    ticket_number: str
    subject: str
    category: str
    status: TicketStatus
    description: str
    public_upvote_count: int = 0
    has_upvoted: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class PublicMessageOut(BaseModel):
    content: str
    created_at: datetime
    sender_role: UserRole

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_message(cls, msg) -> "PublicMessageOut":
        return cls(
            content=msg.content,
            created_at=msg.created_at,
            sender_role=msg.sender.role,
        )


class PublicAttachmentOut(BaseModel):
    id: uuid.UUID
    filename: str
    mime_type: str
    file_size: int
    url: str

    model_config = {"from_attributes": True}


class PublicTicketDetail(PublicTicketOut):
    messages: list[PublicMessageOut] = []
    attachments: list[PublicAttachmentOut] = []


# ---------------------------------------------------------------------------
# Ticket categories
# ---------------------------------------------------------------------------

class TicketCategoryOut(BaseModel):
    key: str
    label: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketCategoryCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    key: str | None = Field(default=None, max_length=100)
    is_active: bool = True

    @field_validator("key")
    @classmethod
    def normalize_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower().replace(" ", "_")
        if not normalized:
            return None
        return normalized


class TicketCategoryAdminUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None


# ---------------------------------------------------------------------------
# FAQ
# ---------------------------------------------------------------------------

class FaqOut(BaseModel):
    id: uuid.UUID
    question: str
    answer: str
    category: str
    tags: list[str]
    view_count: int
    upvote_count: int
    has_upvoted: bool = False
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class FaqCreate(BaseModel):
    question: str = Field(..., max_length=500)
    answer: str
    category: str = Field(..., max_length=100)
    tags: list[str] = Field(default_factory=list)
    is_active: bool = True


class FaqImportRequest(BaseModel):
    items: list[FaqCreate] = Field(..., min_length=1, max_length=500)


class FaqImportResponse(BaseModel):
    imported_count: int
    items: list[FaqOut]


class FaqUpdate(BaseModel):
    """All fields are optional — send only what needs to change (PATCH semantics)."""
    question: str | None = Field(default=None, max_length=500)
    answer: str | None = None
    category: str | None = Field(default=None, max_length=100)
    tags: list[str] | None = None
    is_active: bool | None = None
