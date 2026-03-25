import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.storage.models import TicketCategory, TicketPriority, TicketStatus, UserRole


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
    category: TicketCategory
    priority: TicketPriority = TicketPriority.normal
    is_public: bool = False


class TicketOut(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    description: str
    category: TicketCategory
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


class TicketDetail(TicketOut):
    submitter: UserBrief
    messages: list[MessageOut]
    status_history: list[StatusHistoryOut]


class MessageCreate(BaseModel):
    content: str
    is_internal: bool = False


class StatusUpdate(BaseModel):
    status: TicketStatus
    note: str | None = None


class AssignUpdate(BaseModel):
    agent_id: uuid.UUID


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
    category: TicketCategory
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


# ---------------------------------------------------------------------------
# Public tickets (no PII)
# ---------------------------------------------------------------------------

class PublicTicketOut(BaseModel):
    ticket_number: str
    subject: str
    category: TicketCategory
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}
