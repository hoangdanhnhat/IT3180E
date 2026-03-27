# User Feedback Management System — Documentation

**Version:** 1.0  
**Stack:** FastAPI · PostgreSQL · React (Vite) · Docker

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Project Structure](#3-project-structure)
4. [Backend](#4-backend)
   - 4.1 [Entry Point](#41-entry-point)
   - 4.2 [Configuration](#42-configuration)
   - 4.3 [Authentication & Security](#43-authentication--security)
   - 4.4 [Database Models](#44-database-models)
   - 4.5 [API Routers](#45-api-routers)
   - 4.6 [Services Layer](#46-services-layer)
   - 4.7 [Storage / Repository Layer](#47-storage--repository-layer)
5. [Frontend](#5-frontend)
   - 5.1 [Entry Point & Routing](#51-entry-point--routing)
   - 5.2 [API Client](#52-api-client)
   - 5.3 [Auth Store](#53-auth-store)
   - 5.4 [Pages](#54-pages)
   - 5.5 [Shared Components](#55-shared-components)
6. [Data Flow & Request Lifecycle](#6-data-flow--request-lifecycle)
7. [Ticket State Machine](#7-ticket-state-machine)
8. [Role-Based Access Control](#8-role-based-access-control)
9. [Database Schema](#9-database-schema)
10. [API Reference Summary](#10-api-reference-summary)
11. [Infrastructure & Deployment](#11-infrastructure--deployment)
12. [Environment Variables](#12-environment-variables)

---

## 1. Project Overview

UFMS is a web application that serves as the single communication channel between passengers and a transportation company's support team. It implements a **three-step deflection funnel**:

1. **FAQ suggestion** — as the user types, the system searches a curated FAQ database using PostgreSQL full-text search and surfaces ranked matches, reducing ticket volume.
2. **Public ticket browsing** — resolved public tickets are searchable by anyone, forming a growing self-service knowledge base.
3. **Ticket submission** — if the above steps do not resolve the query, the user submits a ticket which enters the agent queue.

Key capabilities:
- Auto-generated unique ticket numbers (`TKT-YYYY-MM-NNNNN`)
- Full lifecycle tracking with audit log of every status change
- Agent dashboard for queue management, replies, and internal notes
- Admin panel for user management, role assignment, and ticket oversight
- Automatic background job that closes `resolved` tickets older than 7 days
- Email notification hooks on status transitions (SMTP / SendGrid)
- File attachment support (images and PDFs, up to 10 MB)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER (React SPA)                                        │
│  Customer Portal · Agent Dashboard · Admin Panel            │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / REST  (JWT Bearer)
┌──────────────────────────▼──────────────────────────────────┐
│  FastAPI  (/api/v1/*)                                       │
│  auth · tickets · agent · admin                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Service Layer                                              │
│  ticket_service · faq_service · notification_service        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Storage Layer (SQLAlchemy 2.0)                             │
│  ticket_repo · user_repo · faq_repo · message_repo          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 16                                              │
│  Full-text search (tsvector / GIN index) · UUID PKs         │
└─────────────────────────────────────────────────────────────┘
```

The React SPA is built at container image build time and served as static files by the FastAPI process (via `fastapi.staticfiles`). There is no separate frontend server in production.

---

## 3. Project Structure

```
IT3180E/
├── app/                        # Python backend (FastAPI)
│   ├── main.py                 # Application entry point, lifespan, middleware
│   ├── api/
│   │   ├── dependencies.py     # FastAPI dependency injectors (auth guards)
│   │   ├── schemas.py          # Pydantic request/response models
│   │   └── routers/
│   │       ├── auth.py         # /api/v1/auth/*
│   │       ├── tickets.py      # /api/v1/tickets/*
│   │       ├── agent.py        # /api/v1/agent/*
│   │       ├── admin.py        # /api/v1/admin/*
│   │       ├── faq.py          # /api/v1/faq/* (stub)
│   │       └── public_tickets.py
│   ├── core/
│   │   ├── config.py           # Settings loaded from environment / .env
│   │   ├── db.py               # SQLAlchemy engine, session factory, Base
│   │   ├── security.py         # JWT creation/verification, bcrypt hashing
│   │   └── exceptions.py       # Custom HTTP exception helpers
│   ├── services/
│   │   ├── ticket_service.py   # Business logic for ticket operations
│   │   ├── faq_service.py      # FAQ logic (stub)
│   │   └── notification_service.py  # Email notifications (stub)
│   ├── storage/
│   │   ├── models.py           # SQLAlchemy ORM models + enums
│   │   ├── ticket_repo.py      # Low-level ticket DB queries
│   │   ├── user_repo.py        # Low-level user DB queries
│   │   ├── faq_repo.py         # Low-level FAQ DB queries
│   │   └── message_repo.py     # Low-level message DB queries
│   └── tests/
│       ├── test_auth.py
│       ├── test_faq.py
│       └── test_tickets.py
├── alembic/                    # Database migrations
│   └── versions/
│       └── 0001_initial_schema.py
├── frontend/                   # React + Vite SPA
│   ├── src/
│   │   ├── App.jsx             # Root component, client-side routing
│   │   ├── main.jsx            # React DOM mount + providers
│   │   ├── api/
│   │   │   ├── client.js       # Axios instance with JWT interceptors
│   │   │   ├── auth.js         # Auth API calls (login, register, me)
│   │   │   ├── tickets.js      # Ticket API calls
│   │   │   └── admin.js        # Admin API calls
│   │   ├── store/
│   │   │   └── authStore.js    # Zustand auth state (tokens + user)
│   │   ├── components/
│   │   │   ├── ProtectedRoute.jsx    # Route guard (checks token + role)
│   │   │   ├── MessageBubble.jsx     # Chat-style message renderer
│   │   │   ├── TicketCard.jsx        # Ticket summary card
│   │   │   ├── FileDropZone.jsx      # Drag-and-drop file upload widget
│   │   │   └── ui/
│   │   │       ├── Alert.jsx         # Inline alert banner
│   │   │       ├── Badge.jsx         # Status / priority colour badges
│   │   │       ├── Button.jsx        # Styled button with loading state
│   │   │       └── Spinner.jsx       # Loading spinner
│   │   ├── constants/
│   │   │   └── enums.js         # Enum constants and human-readable labels
│   │   └── pages/
│   │       ├── LoginPage.jsx
│   │       ├── RegisterPage.jsx
│   │       ├── dashboard/       # Customer portal
│   │       │   ├── DashboardLayout.jsx
│   │       │   ├── OverviewPage.jsx
│   │       │   ├── MyTicketsPage.jsx
│   │       │   ├── TicketDetailPage.jsx
│   │       │   └── NewTicketPage.jsx
│   │       ├── agent/           # Agent portal
│   │       │   ├── AgentLayout.jsx
│   │       │   └── AgentTicketsPage.jsx
│   │       └── admin/           # Admin panel
│   │           ├── AdminLayout.jsx
│   │           ├── UsersPage.jsx
│   │           ├── CreateUserPage.jsx
│   │           └── AdminTicketsPage.jsx
├── scripts/
│   └── seed_admin.py           # One-time seed: creates the initial admin user
├── schema.sql                  # Raw SQL schema (reference / manual bootstrap)
├── docker-compose.yml          # PostgreSQL + app services
├── Dockerfile                  # Multi-stage build (Node → React, Python → FastAPI)
├── docker-entrypoint.sh        # Container start: migrate → seed → uvicorn
├── requirements.txt
└── alembic.ini
```

---

## 4. Backend

### 4.1 Entry Point

**`app/main.py`**

- Creates the `FastAPI` application with metadata and custom `lifespan`.
- Registers CORS middleware (`ALLOWED_ORIGINS` from config).
- Mounts all API routers under `/api/v1`.
- Starts a background async loop (`_auto_close_loop`) that runs every hour and calls `auto_close_stale_tickets()` — automatically closing any ticket that has been in `resolved` status for more than 7 days.
- Serves the built React SPA as static files and falls back to `index.html` for client-side navigation.
- Exposes a `/health` endpoint.

### 4.2 Configuration

**`app/core/config.py`**

Uses `pydantic-settings` to load all configuration from environment variables (or a `.env` file). All values have sensible defaults for local development.

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/ufms` |
| `SECRET_KEY` | JWT signing secret | `change-me-in-production` |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token TTL | `7` |
| `SMTP_HOST/PORT/USER/PASSWORD` | Outgoing email | SendGrid defaults |
| `EMAIL_FROM` | Sender address | `no-reply@ufms.example.com` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `["http://localhost:3000"]` |
| `UPLOAD_DIR` | File attachment storage path | `uploads` |
| `MAX_UPLOAD_BYTES` | Max attachment size | `10485760` (10 MB) |

### 4.3 Authentication & Security

**`app/core/security.py`**

| Function | Purpose |
|---|---|
| `hash_password(plain)` | Bcrypt-hash a plaintext password |
| `verify_password(plain, hashed)` | Verify a plaintext password against a hash |
| `create_access_token(subject)` | Create a short-lived JWT (`type: access`) |
| `create_refresh_token(subject)` | Create a long-lived JWT (`type: refresh`) |
| `decode_token(token)` | Decode and verify a JWT; raises `JWTError` on failure |

**`app/api/dependencies.py`**

FastAPI dependency functions injected into route handlers:

| Dependency | Behaviour |
|---|---|
| `get_current_user` | Extracts the Bearer token, decodes it, loads the user from DB. Raises 401 if missing/invalid. |
| `require_admin` | Calls `get_current_user`, then raises 403 if role is not `admin`. |
| `require_agent_or_admin` | Calls `get_current_user`, then raises 403 if role is not `agent` or `admin`. |

**Token strategy:**
- The client receives both an **access token** (short TTL, 15 min) and a **refresh token** (long TTL, 7 days) at login/register.
- The access token is sent as a `Bearer` token on every request.
- When the access token expires, the frontend automatically exchanges the refresh token for a new pair via `POST /api/v1/auth/refresh`.
- Logout is stateless — the client simply discards both tokens.

### 4.4 Database Models

**`app/storage/models.py`**

All primary keys are UUIDs. All timestamps use timezone-aware `DateTime`.

#### Enumerations

| Enum | Values |
|---|---|
| `UserRole` | `customer`, `agent`, `admin` |
| `TicketCategory` | `billing`, `delays`, `lost_found`, `route`, `other` |
| `TicketPriority` | `low`, `normal`, `high`, `urgent` |
| `TicketStatus` | `open`, `in_progress`, `pending_customer`, `resolved`, `closed` |

#### Models

| Model | Table | Purpose |
|---|---|---|
| `User` | `users` | Account with role and bcrypt-hashed password |
| `Ticket` | `tickets` | Support request with category, priority, status, and full-text `search_vector` |
| `FaqItem` | `faq_items` | FAQ entry with `search_vector` for full-text search |
| `TicketMessage` | `ticket_messages` | Individual reply or internal note on a ticket |
| `Attachment` | `attachments` | Uploaded file linked to a ticket (and optionally a message) |
| `TicketStatusHistory` | `ticket_status_history` | Immutable audit log of every status transition |

The `search_vector` columns on `Ticket` and `FaqItem` are maintained by PostgreSQL triggers defined in the Alembic migration and are indexed with a GIN index for fast full-text search.

### 4.5 API Routers

All routers are prefixed with `/api/v1`.

#### `app/api/routers/auth.py` — prefix `/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | — | Create a customer account; returns token pair |
| `POST` | `/login` | — | Authenticate; returns token pair |
| `POST` | `/refresh` | — | Exchange refresh token for a new token pair |
| `POST` | `/logout` | User | Stateless logout (client discards tokens) |
| `GET` | `/me` | User | Return current user's profile |

#### `app/api/routers/tickets.py` — prefix `/tickets`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/public` | — | List resolved public tickets (optional keyword filter) |
| `POST` | `` | User | Submit a new ticket |
| `GET` | `` | User | List own tickets |
| `GET` | `/{id}` | User | Ticket detail with messages and status history |
| `POST` | `/{id}/messages` | User | Add a reply or internal note |
| `POST` | `/{id}/attachments` | User | Upload a file attachment |
| `PATCH` | `/{id}/status` | Agent/Admin | Change ticket status |
| `PATCH` | `/{id}/assign` | Agent/Admin | Assign ticket to an agent |

Access rules:
- Customers can only view/reply to their own tickets.
- Agents can only reply to tickets assigned to them.
- Internal notes are stripped from responses sent to customers.

#### `app/api/routers/agent.py` — prefix `/agent`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/tickets` | Agent/Admin | List tickets assigned to the authenticated agent |
| `GET` | `/tickets/{id}` | Agent/Admin | Full ticket detail (agents restricted to assigned tickets) |

#### `app/api/routers/admin.py` — prefix `/admin`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | Admin | List all users with ticket counts |
| `GET` | `/users/{id}/tickets` | Admin | List tickets for a specific user |
| `POST` | `/users` | Admin | Manually create an account with any role |
| `PATCH` | `/users/{id}/role` | Admin | Update a user's role |
| `GET` | `/tickets` | Admin | List all tickets with submitter/assignee info |
| `PATCH` | `/tickets/{id}/priority` | Admin | Change any ticket's priority |

### 4.6 Services Layer

The services layer contains **business logic** that sits between routers and repositories.

**`app/services/ticket_service.py`**

| Function | Purpose |
|---|---|
| `create_ticket(...)` | Delegates to the repo; returns the created ticket |
| `get_ticket_or_404(db, id)` | Fetches ticket; raises HTTP 404 if not found |
| `list_own_tickets(db, user_id)` | Returns all tickets for a customer |
| `list_public_tickets(db, q)` | Returns public resolved tickets, optional full-text filter |
| `list_assigned_tickets(db, agent_id)` | Returns tickets assigned to an agent |
| `add_message(...)` | Validates permissions (internal notes, agent assignment), auto-transitions `open → in_progress` when an agent first replies, persists the message |
| `update_status(...)` | Validates the requested transition against the state machine, persists the new status and creates a history record |
| `auto_close_stale_tickets(db)` | Bulk-closes `resolved` tickets older than 7 days; called by the background loop in `main.py` |

**`app/services/faq_service.py`** — stub, not yet implemented.  
**`app/services/notification_service.py`** — stub, not yet implemented (SMTP hooks planned).

### 4.7 Storage / Repository Layer

Each repository module provides thin, reusable functions that issue SQL queries via SQLAlchemy. They contain **no business logic**.

| Module | Responsibility |
|---|---|
| `app/storage/ticket_repo.py` | CRUD for tickets, messages, attachments, status history; ticket number generation; full-text search for public tickets |
| `app/storage/user_repo.py` | CRUD for users; password hashing on create |
| `app/storage/faq_repo.py` | CRUD for FAQ items; full-text search |
| `app/storage/message_repo.py` | Message retrieval |

**Ticket number format:** `TKT-YYYY-MM-NNNNN`  
The sequence resets per month and is derived by counting existing tickets in that month.

---

## 5. Frontend

Built with **React 18 + Vite**. State management is handled by **Zustand**; server data fetching by **React Query (TanStack Query)**.

### 5.1 Entry Point & Routing

**`frontend/src/App.jsx`**

On mount, `App` attempts to restore the session from `localStorage` by calling `GET /api/v1/auth/me`. If the access token has expired, it tries a refresh before falling back to logout. While this initialisation is in progress, a full-screen spinner is displayed.

Route structure:

```
/login                              LoginPage
/register                           RegisterPage

/dashboard   [ProtectedRoute]       DashboardLayout
  index                               OverviewPage
  /my-tickets                         MyTicketsPage
  /tickets/:id                        TicketDetailPage
  /new-ticket                         NewTicketPage

/agent       [ProtectedRoute: agent|admin]   AgentLayout
  /tickets                            AgentTicketsPage

/admin       [ProtectedRoute: admin]  AdminLayout
  /users                              UsersPage
  /users/new                          CreateUserPage
  /tickets                            AdminTicketsPage

/            → redirect to /dashboard
```

### 5.2 API Client

**`frontend/src/api/client.js`**

A configured Axios instance with two interceptors:

1. **Request interceptor** — automatically attaches `Authorization: Bearer <accessToken>` from the Zustand store to every outgoing request.
2. **Response interceptor** — intercepts `401 Unauthorized` responses. If a refresh token is available, it:
   - Pauses all concurrent requests (queues them).
   - Performs a single `POST /auth/refresh` call.
   - On success: updates the store, drains the queue with the new token, and retries the original request.
   - On failure: clears the store and redirects to `/login`.

This makes token refresh completely transparent to the rest of the application.

### 5.3 Auth Store

**`frontend/src/store/authStore.js`**

Zustand store that holds:

| State | Type | Description |
|---|---|---|
| `accessToken` | `string \| null` | JWT access token |
| `refreshToken` | `string \| null` | JWT refresh token |
| `user` | `object \| null` | Current user profile (`id`, `email`, `full_name`, `role`) |

Tokens are persisted to `localStorage` under the key `ufms_tokens` and reloaded on page refresh.

| Action | Behaviour |
|---|---|
| `login(tokens, user)` | Saves tokens to storage and state |
| `logout()` | Clears tokens from storage and state |
| `setUser(user)` | Updates the user profile without changing tokens |
| `setTokens(access, refresh)` | Updates tokens only (used by the refresh interceptor) |

### 5.4 Pages

#### Customer Portal (`/dashboard`)

| Page | Purpose |
|---|---|
| `OverviewPage` | Landing page shown after login; summary/welcome view |
| `MyTicketsPage` | Lists all tickets submitted by the current user using `TicketCard` components |
| `NewTicketPage` | Form to submit a new ticket (subject, description, category, priority, public flag) |
| `TicketDetailPage` | Full ticket view: message thread rendered with `MessageBubble`, status/priority badges, reply form, and — for agents/admins — status transition buttons |

`TicketDetailPage` enforces the state machine client-side by computing the set of valid next statuses from lookup tables (`AGENT_TRANSITIONS`, `CUSTOMER_TRANSITIONS`) based on the current user's role. This mirrors the server-side state machine in `ticket_service.py`.

#### Agent Portal (`/agent`)

| Page | Purpose |
|---|---|
| `AgentTicketsPage` | Lists all tickets assigned to the authenticated agent |

Agents navigate to a ticket's detail view via the shared `TicketDetailPage` route at `/dashboard/tickets/:id`.

#### Admin Panel (`/admin`)

| Page | Purpose |
|---|---|
| `UsersPage` | Lists all users with role badges and ticket counts |
| `CreateUserPage` | Form to create any user account with a specified role |
| `AdminTicketsPage` | Lists all tickets across the system with submitter/assignee info; allows priority changes |

### 5.5 Shared Components

| Component | Purpose |
|---|---|
| `ProtectedRoute` | Wraps routes that require authentication or a specific role. Redirects to `/login` if not authenticated; redirects to `/dashboard` if authenticated but role is insufficient. Accepts `requireAdmin` and `requireAgentOrAdmin` props. |
| `MessageBubble` | Renders a single ticket message. Agent/admin messages appear right-aligned; customer messages left-aligned. Internal notes are visually distinct (yellow background). |
| `TicketCard` | Compact ticket summary card showing ticket number, subject, status badge, priority badge and date. |
| `FileDropZone` | Drag-and-drop file upload widget. Validates MIME type and file size before POSTing to the attachments endpoint. |
| `ui/Alert` | Inline alert banner with `error`, `warning`, and `info` variants. |
| `ui/Badge` | `StatusBadge` and `PriorityBadge` render colour-coded chips from the status/priority value. |
| `ui/Button` | Styled button with an optional `loading` prop that shows a spinner and disables the button while a mutation is in flight. |
| `ui/Spinner` | Animated loading spinner. Accepts a `size` prop (`sm`, `md`, `lg`). |

---

## 6. Data Flow & Request Lifecycle

### Submitting a ticket (customer)

```
Browser
  │  (1) POST /api/v1/tickets  {subject, description, category, priority, is_public}
  │      Authorization: Bearer <access_token>
  ▼
FastAPI router (tickets.py)
  │  (2) get_current_user dependency → decodes JWT → loads User from DB
  │  (3) Calls ticket_service.create_ticket(...)
  ▼
ticket_service.create_ticket
  │  (4) Delegates to ticket_repo.create_ticket(...)
  ▼
ticket_repo.create_ticket
  │  (5) Generates ticket number  TKT-YYYY-MM-NNNNN
  │  (6) Inserts Ticket row
  │  (7) Inserts TicketStatusHistory row  (old=None, new=open)
  │  (8) Commits transaction
  ▼
FastAPI router
  │  (9) Serialises Ticket → TicketOut (Pydantic) → JSON
  ▼
Browser  ← 201 Created  {id, ticket_number, status: "open", ...}
```

### Agent replying and auto-transitioning to In Progress

```
Browser (agent)
  │  POST /api/v1/tickets/{id}/messages  {content, is_internal: false}
  ▼
ticket_service.add_message
  │  Validates: sender is agent, ticket.assigned_to == sender.id
  │  ticket.status == "open"  →  auto-transition to "in_progress"
  │    → ticket_repo.update_ticket_status(db, ticket, in_progress, sender_id)
  │       → updates Ticket.status
  │       → inserts TicketStatusHistory row
  │  Persists TicketMessage row
  ▼
Browser ← 201 Created  MessageOut
```

---

## 7. Ticket State Machine

```
                ┌─────────────────────────────────────────┐
                │              OPEN                        │
                │  (initial state on ticket creation)      │
                └──────────┬──────────────────────────────┘
                           │  Agent first reply (auto)
                ┌──────────▼──────────────────────────────┐
                │           IN PROGRESS                    │
                │  Agent is actively working on ticket     │
                └──────┬──────────────────┬───────────────┘
                       │                  │ Agent asks for
                       │                  │ more info
  Agent resolves       │       ┌──────────▼──────────────────┐
  issue                │       │     PENDING CUSTOMER         │
                       │       │  Waiting for customer reply  │
                       │       └──────────┬──────────────────┘
                       │                  │ Customer replies (auto)
                       │                  │ → back to IN PROGRESS
                ┌──────▼──────────────────▼──────────────┐
                │              RESOLVED                    │
                │  Issue resolved; awaiting customer ack   │
                └──────┬──────────────────────────────────┘
                       │                        │
           Customer    │                        │ Customer
           reopens     │                        │ confirms → CLOSED
                       │                  ┌─────▼──────────────────┐
                       │                  │        CLOSED            │
                       │                  │  Terminal state;         │
                       │                  │  auto-closed after 7 days│
                       └──→ OPEN          └─────────────────────────┘
```

| Transition | Who can trigger |
|---|---|
| `open → in_progress` | Agent (automatic on first reply) |
| `in_progress → pending_customer` | Agent |
| `in_progress → resolved` | Agent |
| `pending_customer → in_progress` | Agent (or when customer replies) |
| `resolved → closed` | Customer or background job (7-day auto-close) |
| `resolved → open` | Customer (reopen) |

---

## 8. Role-Based Access Control

| Action | Customer | Agent | Admin |
|---|---|---|---|
| Register / login | ✅ | ✅ | ✅ |
| Submit a ticket | ✅ | ✅ | ✅ |
| View own tickets | ✅ | ✅ | ✅ |
| View ticket detail (own) | ✅ | ✅ | ✅ |
| View ticket detail (any) | ❌ | assigned only | ✅ |
| Reply to a ticket | ✅ (own) | assigned only | ✅ |
| Post internal note | ❌ | assigned only | ✅ |
| Change ticket status | customer transitions only | agent transitions only | ✅ |
| Assign ticket to agent | ❌ | ✅ | ✅ |
| View all users | ❌ | ❌ | ✅ |
| Create / modify user roles | ❌ | ❌ | ✅ |
| View all tickets (system-wide) | ❌ | ❌ | ✅ |
| Change ticket priority | ❌ | ❌ | ✅ |
| Browse public tickets | ✅ (unauthenticated too) | ✅ | ✅ |

---

## 9. Database Schema

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `email` | VARCHAR(255) | Unique, indexed |
| `password_hash` | VARCHAR(255) | bcrypt |
| `full_name` | VARCHAR(255) | |
| `role` | ENUM(userrole) | `customer` \| `agent` \| `admin` |
| `is_active` | BOOLEAN | Soft-disable accounts |
| `created_at` | TIMESTAMPTZ | Server default |

### `tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `ticket_number` | VARCHAR(20) | Unique; `TKT-YYYY-MM-NNNNN` |
| `user_id` | UUID FK → users | Submitter |
| `assigned_to` | UUID FK → users | NULL until assigned |
| `subject` | VARCHAR(255) | |
| `description` | TEXT | |
| `category` | ENUM(ticketcategory) | |
| `priority` | ENUM(ticketpriority) | Default: `normal` |
| `status` | ENUM(ticketstatus) | Default: `open` |
| `is_public` | BOOLEAN | Whether resolved ticket is publicly visible |
| `search_vector` | TSVECTOR | Maintained by PG trigger; GIN indexed |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `faq_items`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `question` | VARCHAR(500) | |
| `answer` | TEXT | |
| `category` | VARCHAR(100) | |
| `tags` | VARCHAR[] | PostgreSQL ARRAY |
| `view_count` | INTEGER | |
| `is_active` | BOOLEAN | |
| `search_vector` | TSVECTOR | GIN indexed |
| `created_at` | TIMESTAMPTZ | |

### `ticket_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `ticket_id` | UUID FK → tickets | CASCADE delete |
| `sender_id` | UUID FK → users | |
| `content` | TEXT | |
| `is_internal` | BOOLEAN | If true, hidden from customers |
| `created_at` | TIMESTAMPTZ | |

### `attachments`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `ticket_id` | UUID FK → tickets | CASCADE delete |
| `message_id` | UUID FK → ticket_messages | Nullable |
| `filename` | VARCHAR(255) | Original filename |
| `storage_path` | VARCHAR(500) | Server-side path under `UPLOAD_DIR` |
| `mime_type` | VARCHAR(100) | |
| `file_size` | INTEGER | Bytes |

### `ticket_status_history`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `ticket_id` | UUID FK → tickets | CASCADE delete |
| `changed_by` | UUID FK → users | |
| `old_status` | ENUM(ticketstatus) | NULL on ticket creation |
| `new_status` | ENUM(ticketstatus) | |
| `note` | TEXT | Optional comment |
| `changed_at` | TIMESTAMPTZ | Server default |

---

## 10. API Reference Summary

Full interactive documentation is available at:
- **Swagger UI:** `http://localhost:8000/api/docs`
- **ReDoc:** `http://localhost:8000/api/redoc`

Base URL for all API calls: `/api/v1`

| Prefix | Router file | Scope |
|---|---|---|
| `/auth` | `routers/auth.py` | Authentication (public + user) |
| `/tickets` | `routers/tickets.py` | Ticket CRUD (user + agent/admin) |
| `/agent` | `routers/agent.py` | Agent queue view (agent/admin) |
| `/admin` | `routers/admin.py` | User & ticket management (admin only) |

---

## 11. Infrastructure & Deployment

### Docker Compose

Two services are defined in `docker-compose.yml`:

| Service | Image | Purpose |
|---|---|---|
| `db` | `postgres:16-alpine` | PostgreSQL database with a named volume `pgdata` |
| `app` | Built from `Dockerfile` | FastAPI backend + built React SPA |

The `app` service is configured to wait for `db` to pass its health check before starting.

### Dockerfile (multi-stage)

**Stage 1 — `frontend-build` (node:20-slim)**
1. Installs npm dependencies.
2. Runs `npm run build` — produces `frontend/dist/`.

**Stage 2 — `python:3.12-slim`**
1. Installs Python dependencies from `requirements.txt`.
2. Copies project source.
3. Overlays the built frontend from stage 1.
4. Creates a non-root `appuser` for security.
5. Sets the entrypoint to `docker-entrypoint.sh`.

### `docker-entrypoint.sh`

The startup sequence is:
1. Run Alembic migrations (`alembic upgrade head`).
2. Run `scripts/seed_admin.py` to create the initial admin account if it does not exist.
3. Start the Uvicorn ASGI server on port 8000.

### Quick Start

```bash
# Start all services
docker compose up

# Application is available at:
#   http://localhost:8000        — React SPA
#   http://localhost:8000/api/docs — Swagger UI
```

---

## 12. Environment Variables

Create a `.env` file in the project root to override defaults. All variables are optional in development.

```dotenv
# Database
DATABASE_URL=postgresql://postgres:secret@db:5432/ufms

# Security (CHANGE IN PRODUCTION)
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:8000"]

# Email (optional)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
EMAIL_FROM=no-reply@yourapp.com

# First-run admin account (used by seed_admin.py)
ADMIN_EMAIL=admin@yourapp.com
ADMIN_PASSWORD=Admin1234!
ADMIN_NAME=System Administrator

# File uploads
UPLOAD_DIR=uploads
MAX_UPLOAD_BYTES=10485760
```
