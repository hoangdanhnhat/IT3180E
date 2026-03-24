# User Feedback Management System — Development Plan

**Project:** User Feedback Management System (UFMS)
**Application type:** Web application
**Backend:** Python (FastAPI)
**Database:** PostgreSQL
**Version:** 1.0

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [System Architecture](#2-system-architecture)
   - 2.1 [Architecture Layers](#21-architecture-layers)
   - 2.2 [Backend Stack](#22-backend-stack)
   - 2.3 [Database Schema](#23-database-schema)
   - 2.4 [API Endpoints](#24-api-endpoints)
   - 2.5 [Ticket Lifecycle](#25-ticket-lifecycle)
3. [Human Interface Design](#3-human-interface-design)
   - 3.1 [Customer Portal](#31-customer-portal)
   - 3.2 [Agent Dashboard](#32-agent-dashboard)
   - 3.3 [Admin Panel](#33-admin-panel)
4. [Development Phases](#4-development-phases)
5. [Non-Functional Requirements](#5-non-functional-requirements)

---

## 1. System Overview

The **User Feedback Management System (UFMS)** is a web application that serves as the single communication channel between passengers and the transportation company's support team. It is designed around a three-step deflection funnel: the system first attempts to resolve the user's query automatically, then through self-service, and only escalates to a human agent as a last resort.

### Core capabilities

**Real-time FAQ suggestion** — as the user types their query, the interface searches a curated FAQ database using PostgreSQL full-text search and surfaces ranked matches instantly (debounced, no page reload). This reduces unnecessary ticket volume by surfacing answers proactively.

**Public ticket browsing** — resolved tickets flagged as public are searchable by other users. This creates a growing self-service knowledge base over time, ensuring common issues are resolved without duplicating effort.

**Auto-ticketing** — every submission that proceeds past the self-service steps generates a unique ticket number (e.g. `TKT-2026-00847`) automatically. The ticket is stored with full metadata: category, priority, submitter, timestamp, assigned agent, and current status.

**Full lifecycle tracking** — tickets move through a defined state machine (`Open → In Progress → Pending Customer → Resolved → Closed`), with automatic email notifications sent to the customer at each transition. Every status change is recorded in an audit log.

**Agent dashboard** — an internal interface for support staff to view the queue, triage tickets, assign ownership, respond, and close tickets. Agents can also leave internal notes that are not visible to the customer.

**Admin panel** — allows administrators to manage the FAQ database, create and deactivate user accounts, assign roles, and view operational reports.

---

## 2. System Architecture

The system follows a three-tier architecture: a React single-page application (SPA) as the frontend, a Python/FastAPI REST API as the backend, and a PostgreSQL relational database as the persistence layer. All three tiers are containerised using Docker and deployed behind an Nginx reverse proxy.

### 2.1 Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (React SPA)                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────┐ │
│  │  Customer portal │  │  Agent dashboard │  │  Admin    │ │
│  │  Submit & track  │  │  Triage & respond│  │  panel    │ │
│  └──────────────────┘  └──────────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │ HTTPS / REST
┌─────────────────────────────────────────────────────────────┐
│  API LAYER (FastAPI / Python)                               │
│  JWT auth · rate limiting · request routing · OpenAPI docs  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│  SERVICE LAYER                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Ticket svc   │  │  FAQ service │  │ Notification svc  │ │
│  │ CRUD·lifecycle│  │ Search·rank  │  │ Email·alerts      │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│  STORAGE LAYER                                              │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │  PostgreSQL 16           │  │  Object storage          │ │
│  │  Tickets·users·FAQ       │  │  File attachments        │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Backend Stack

| Layer | Technology | Rationale |
|---|---|---|
| Web framework | FastAPI (Python 3.12) | Async support, automatic OpenAPI documentation, high performance |
| ORM | SQLAlchemy 2.0 + Alembic | Type-safe queries, schema migration management |
| Database | PostgreSQL 16 | Native full-text search (`tsvector`), JSONB for metadata, proven reliability |
| Authentication | JWT + bcrypt | Stateless tokens, role-based access control |
| Email | SendGrid / SMTP | Transactional notifications on ticket status changes |
| Task queue | Celery | Async email dispatch, scheduled report generation |
| Containerisation | Docker + Docker Compose | Consistent environments across development and production |
| Reverse proxy | Nginx | SSL termination, static file serving, request forwarding |

### 2.3 Database Schema

The database consists of six primary tables.

#### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `email` | `varchar(255)` | Unique, indexed |
| `password_hash` | `varchar(255)` | bcrypt hash |
| `full_name` | `varchar(255)` | |
| `role` | `enum` | `customer`, `agent`, `admin` |
| `is_active` | `boolean` | Default `true` |
| `created_at` | `timestamp` | |

#### `tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `ticket_number` | `varchar(20)` | Unique, e.g. `TKT-2026-00847` |
| `user_id` | `uuid` | FK → `users.id` |
| `assigned_to` | `uuid` | FK → `users.id` (nullable) |
| `subject` | `varchar(255)` | |
| `description` | `text` | |
| `category` | `enum` | `billing`, `delays`, `lost_found`, `route`, `other` |
| `priority` | `enum` | `low`, `normal`, `high`, `urgent` |
| `status` | `enum` | See lifecycle below |
| `is_public` | `boolean` | Whether resolved ticket is visible to other users |
| `search_vector` | `tsvector` | Auto-updated for full-text search |
| `created_at` | `timestamp` | |
| `updated_at` | `timestamp` | |

#### `faq_items`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `question` | `varchar(500)` | |
| `answer` | `text` | |
| `category` | `varchar(100)` | |
| `tags` | `text[]` | Array of keyword tags |
| `view_count` | `integer` | Incremented on each display |
| `is_active` | `boolean` | Soft delete |
| `search_vector` | `tsvector` | Auto-updated for full-text search |
| `created_at` | `timestamp` | |

#### `ticket_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `ticket_id` | `uuid` | FK → `tickets.id` |
| `sender_id` | `uuid` | FK → `users.id` |
| `content` | `text` | |
| `is_internal` | `boolean` | Internal agent notes are hidden from customer |
| `created_at` | `timestamp` | |

#### `attachments`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `ticket_id` | `uuid` | FK → `tickets.id` |
| `message_id` | `uuid` | FK → `ticket_messages.id` (nullable) |
| `filename` | `varchar(255)` | Original filename |
| `storage_path` | `varchar(500)` | Path in object storage |
| `mime_type` | `varchar(100)` | |
| `file_size` | `integer` | Bytes |

#### `ticket_status_history`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `ticket_id` | `uuid` | FK → `tickets.id` |
| `changed_by` | `uuid` | FK → `users.id` |
| `old_status` | `enum` | |
| `new_status` | `enum` | |
| `note` | `text` | Optional context for the change |
| `changed_at` | `timestamp` | |

**Full-text search indexes** are created on `tickets.search_vector` and `faq_items.search_vector` using `GIN` indexes. Both vectors are automatically updated via PostgreSQL triggers on insert and update.

### 2.4 API Endpoints

All endpoints are prefixed with `/api/v1`. Authentication is enforced via a `Bearer` JWT token in the `Authorization` header. Roles determine access: `customer`, `agent`, and `admin`.

#### Auth — `/auth`

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register a new customer account |
| `POST` | `/auth/login` | Public | Authenticate and receive JWT |
| `POST` | `/auth/refresh` | Authenticated | Refresh access token |
| `POST` | `/auth/logout` | Authenticated | Invalidate refresh token |

#### Tickets — `/tickets`

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/tickets` | Customer | Submit a new ticket (auto-assigns ticket number) |
| `GET` | `/tickets` | Customer | List the authenticated user's own tickets |
| `GET` | `/tickets/{id}` | Customer / Agent | Get ticket detail including messages |
| `POST` | `/tickets/{id}/messages` | Customer / Agent | Add a reply or internal note |
| `PATCH` | `/tickets/{id}/status` | Agent | Update ticket status |
| `PATCH` | `/tickets/{id}/assign` | Agent | Assign ticket to an agent |
| `GET` | `/tickets/public` | Public | Browse public resolved tickets |

#### FAQ — `/faq`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/faq/suggest` | Public | Returns ranked FAQ matches for a query string (`?q=`) |
| `GET` | `/faq` | Public | List all active FAQ items |
| `GET` | `/faq/{id}` | Public | Get a single FAQ item (increments view count) |
| `POST` | `/faq` | Admin | Create a new FAQ item |
| `PUT` | `/faq/{id}` | Admin | Update an FAQ item |
| `DELETE` | `/faq/{id}` | Admin | Soft-delete an FAQ item |

#### Agent — `/agent`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/agent/queue` | Agent | Get the full open ticket queue with filters |
| `GET` | `/agent/tickets` | Agent | Get tickets assigned to the authenticated agent |

#### Admin — `/admin`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/admin/tickets` | Admin | Full ticket list with advanced filters |
| `GET` | `/admin/users` | Admin | List all users |
| `POST` | `/admin/users` | Admin | Create an agent or admin account |
| `PATCH` | `/admin/users/{id}` | Admin | Update role or deactivate a user |
| `GET` | `/admin/reports` | Admin | Ticket volume, resolution time, category breakdown |

### 2.5 Ticket Lifecycle

Every ticket follows a strict state machine. Invalid transitions are rejected by the API with a `422` error. Every valid transition is recorded in `ticket_status_history` and triggers an email notification to the customer.

```
         ┌──────────────────────────────────────────────┐
         │                                              │
         ▼                                              │
      [Open] ──► [In Progress] ──► [Pending Customer] ──┘
                      │
                      ▼
                 [Resolved] ──► [Closed]
```

| From | To | Who can trigger | Notification sent |
|---|---|---|---|
| — | `Open` | System (on submission) | Confirmation email with ticket number |
| `Open` | `In Progress` | Agent | "Your ticket is being reviewed" |
| `In Progress` | `Pending Customer` | Agent | "We need more information from you" |
| `Pending Customer` | `In Progress` | Customer (reply) | "Your reply was received" (to agent) |
| `In Progress` | `Resolved` | Agent | "Your issue has been resolved" |
| `Resolved` | `Closed` | System (7-day timer) or Customer | "Your ticket has been closed" |
| `Resolved` | `Open` | Customer (re-open request) | "Your ticket has been re-opened" |

---

## 3. Human Interface Design

The interface has two distinct faces served from a single React SPA: the **customer portal** (public-facing) and the **agent/admin dashboard** (internal). Routing and role-based rendering are handled client-side after authentication.

### 3.1 Customer Portal

The customer portal guides users through a three-step deflection funnel before a ticket is ever created. The goal is to resolve as many queries as possible through self-service.

#### Step 1 — Query input with live FAQ suggestions

The landing page presents a single prominent text input. As the user types (debounced at 300ms), the interface calls `GET /faq/suggest?q=` and displays up to five ranked FAQ matches inline beneath the input, ordered by text search relevance and weighted by view count. Each suggestion shows the question title and a short excerpt of the answer.

If the user finds a match, they can click it to expand the full answer. The ticket submission path is bypassed entirely.

#### Step 2 — Public ticket browser

If the FAQ suggestions do not satisfy the user, a "Didn't find what you needed?" section appears below. This shows the count of public resolved tickets that match the query and offers a "Browse similar tickets" button. The browser displays ticket subjects, categories, and resolutions without exposing customer names or personal data.

#### Step 3 — Ticket submission form

If neither the FAQ nor public tickets resolve the issue, the user proceeds to the submission form. The form captures:

- **Category** — select from: Billing & payments, Delays & cancellations, Lost & found, Route enquiry, Other
- **Priority** — Normal, High, or Urgent
- **Subject** — short text field
- **Description** — free text, supports line breaks
- **Attachments** — optional file upload (PDF, JPG, PNG, max 10 MB per file)
- **Share resolution publicly** — toggle allowing the resolved ticket to appear in the public browser (customer name is always hidden)

On submission, the system auto-generates a unique ticket number and displays a confirmation screen with the number and a link to track the ticket.

#### Ticket tracking page

Authenticated customers can view all their submitted tickets at `/my-tickets`. Each ticket shows the current status, the message thread, and a reply box to add follow-up information. Status changes are highlighted with timestamps.

### 3.2 Agent Dashboard

The agent dashboard is accessible only to users with the `agent` or `admin` role. It provides a real-time view of the support queue.

#### Queue view

The main queue table displays all open tickets with the following columns: ticket number, subject, category, priority, status, assigned agent, and age. The table supports filtering by status, category, priority, and assignee, as well as free-text search across subject and description. Rows are colour-coded by priority.

A summary bar at the top of the queue shows four key metrics: total open, in progress, pending customer reply, and resolved today.

#### Ticket detail view

Clicking a ticket opens a split view: the left panel shows the full message thread (with internal notes clearly distinguished by a different background colour), and the right panel shows ticket metadata (submitter, category, priority, assigned agent, status history). Agents can:

- Reply to the customer (visible in the thread)
- Add an internal note (visible only to agents)
- Change the ticket status
- Re-assign the ticket to another agent
- Upload attachments

#### FAQ editor

Agents can access a simple FAQ editor to propose new entries or edits, which are then approved and published by an admin.

### 3.3 Admin Panel

The admin panel extends the agent dashboard with additional capabilities:

- **FAQ management** — create, edit, activate, and deactivate FAQ items. Bulk import via CSV is supported.
- **User management** — create agent and admin accounts, deactivate accounts, and change roles.
- **Reports** — view charts for ticket volume over time, average resolution time by category, FAQ deflection rate (queries answered by FAQ vs. proceeding to ticket), and top categories.

---

## 4. Development Phases

The project is planned across five sequential phases over fourteen weeks.

### Phase 1 — Foundation (Weeks 1–3)

Establish the project structure, database, and core API.

- Initialise FastAPI project with folder structure, linting (Ruff), and testing setup (pytest)
- Define all SQLAlchemy models and generate initial Alembic migration
- Implement user registration, login, JWT issuance, and role middleware
- Build ticket CRUD endpoints: create, read, list (own tickets), add message, change status
- Implement unique ticket number generator (`TKT-YYYY-NNNNN` format, auto-incremented per year)
- Write unit tests for auth and ticket services
- Docker Compose setup for local development (app + PostgreSQL)

**Deliverable:** Working REST API for ticket submission and retrieval, fully tested.

### Phase 2 — FAQ and Self-Service (Weeks 4–5)

Build the intelligent FAQ suggestion engine and public ticket browser.

- Create `faq_items` table and populate with initial dataset
- Add `tsvector` columns and GIN indexes to both `tickets` and `faq_items`
- Write PostgreSQL triggers to auto-update search vectors on insert/update
- Implement `GET /faq/suggest?q=` with ranked full-text search, weighted by `view_count`
- Implement `GET /tickets/public` for browsing resolved public tickets by keyword
- Write integration tests for search ranking and edge cases (empty query, no results)

**Deliverable:** FAQ suggestion endpoint returning ranked results; public ticket browser endpoint.

### Phase 3 — Customer Portal Frontend (Weeks 6–8)

Build the complete customer-facing React application.

- Scaffold React SPA with routing (React Router), state management (Zustand), and API client (Axios)
- Implement the three-step submission funnel: query input → FAQ suggestions dropdown → public ticket browser → submission form
- Build the ticket submission form with validation, file upload, and confirmation screen
- Build the "My tickets" page with status tracking, message thread, and reply functionality
- Implement registration and login screens
- End-to-end testing of the full customer submission journey

**Deliverable:** Fully functional customer portal connected to the live API.

### Phase 4 — Agent Dashboard and Notifications (Weeks 9–11)

Build the internal agent interface and automate notifications.

- Build the agent queue view with filtering, sorting, and colour-coded priority rows
- Build the ticket detail view with split-panel layout, message thread, internal notes, and status actions
- Implement ticket re-assignment between agents
- Set up Celery with a database-backed broker for async task processing
- Implement email notifications for all lifecycle transitions (using templates for each event type)
- Build the FAQ editor (propose/edit entries, pending admin approval)
- Status history audit log visible in the ticket detail panel

**Deliverable:** Agents can fully manage the ticket queue; customers receive email updates on all status changes.

### Phase 5 — Admin Panel, QA, and Launch (Weeks 12–14)

Complete the admin layer, perform quality assurance, and deploy.

- Build the admin panel: FAQ full CRUD with CSV bulk import, user management, role assignment
- Build the reports view: ticket volume chart, resolution time by category, FAQ deflection rate
- Conduct end-to-end testing across all three roles (customer, agent, admin)
- Performance testing of the FAQ suggestion endpoint under simulated concurrent load
- Security audit: input validation, SQL injection prevention (SQLAlchemy parameterised queries), XSS headers, rate limiting on auth endpoints
- Production Docker configuration with Nginx, environment variable management
- CI/CD pipeline setup (GitHub Actions): lint → test → build → deploy
- User acceptance testing (UAT) with the company's support team
- Go-live and handover documentation

**Deliverable:** Production-ready application deployed and verified.

---

## 5. Non-Functional Requirements

| Requirement | Target |
|---|---|
| FAQ suggestion response time | < 300ms at p95 under normal load |
| Ticket submission response time | < 500ms at p95 |
| Database query time (indexed lookups) | < 50ms |
| Maximum file attachment size | 10 MB per file |
| Session token expiry | 15 minutes (access token), 7 days (refresh token) |
| Email notification delivery | Within 2 minutes of status change |
| Uptime target | 99.5% monthly |
| Supported browsers | Chrome, Firefox, Safari, Edge (last 2 major versions) |
| Mobile responsiveness | Full functionality on screens ≥ 375px wide |
| Data retention | Tickets retained for 5 years; attachments for 2 years |
| Audit log retention | Indefinite (ticket_status_history never deleted) |