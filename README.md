# User Feedback Management System

UFMS is a full-stack support ticketing application for collecting, triaging, and resolving user feedback. It provides separate customer, agent, and admin workflows backed by a FastAPI REST API, PostgreSQL, and a React single-page app.

## Features

- Customer registration, login, token refresh, and protected account sessions
- Customer dashboard for creating tickets, viewing ticket history, replying to staff, and uploading attachments
- Public knowledge base built from resolved tickets marked as public
- FAQ browser with keyword search, categories, view counts, and user upvotes
- Agent queue for browsing, claiming, replying to, transferring, and updating tickets
- Admin panel for managing users, roles, priorities, ticket categories, tickets, and FAQs
- Ticket lifecycle tracking with status history
- File attachments for images and PDFs up to 10 MB
- PostgreSQL full-text search support for FAQs and public tickets
- Hourly background sweep that closes resolved tickets older than 7 days
- Docker Compose setup that builds the frontend, runs migrations, seeds an admin user, and starts the API

## Tech Stack

| Area | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 |
| Database | PostgreSQL 16, Alembic migrations |
| Frontend | React 19, Vite, React Router, TanStack Query, Zustand, Tailwind CSS |
| Auth | JWT access and refresh tokens, bcrypt password hashing |
| Deployment | Docker, Docker Compose |

## Project Structure

```text
.
+-- app/                    # FastAPI backend
|   +-- api/                # Routers, schemas, dependencies
|   +-- core/               # Config, database, security, exceptions
|   +-- services/           # Business logic
|   +-- storage/            # SQLAlchemy models and repositories
+-- alembic/                # Database migrations
+-- frontend/               # React + Vite application
+-- scripts/                # Utility scripts, including admin seeding
+-- Dockerfile              # Multi-stage frontend/backend image
+-- docker-compose.yml      # PostgreSQL + application services
+-- docker-entrypoint.sh    # Wait for DB, migrate, seed admin, start server
+-- requirements.txt        # Python dependencies
+-- DOCUMENTATION.md        # Detailed system documentation
```

## Quick Start With Docker

The easiest way to run the project is with Docker Compose.

```bash
docker compose up --build
```

Open the application at:

```text
http://localhost:8000
```

The API documentation is available at:

```text
http://localhost:8000/api/docs
```

On first startup, the container runs Alembic migrations and creates an admin account if it does not already exist.

Default admin credentials:

```text
Email:    admin@ufms.hehe
Password: Admin1234!
```

For local or shared deployments, override these values in `.env`.

## Environment Variables

Create a `.env` file in the project root when you need to override defaults.

```env
POSTGRES_PASSWORD=secret
DATABASE_URL=postgresql://postgres:secret@db:5432/ufms
SECRET_KEY=replace-with-a-long-random-secret
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=["http://localhost:8000"]

ADMIN_EMAIL=admin@ufms.hehe
ADMIN_PASSWORD=Admin1234!
ADMIN_NAME=System Administrator

SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=
EMAIL_FROM=no-reply@ufms.example.com
```

Important variables:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by FastAPI and Alembic | `postgresql://postgres:password@localhost:5432/ufms` |
| `SECRET_KEY` | JWT signing secret | `change-me-in-production` |
| `ALLOWED_ORIGINS` | CORS allow-list | `["http://localhost:3000"]` |
| `UPLOAD_DIR` | Attachment storage directory | `uploads` |
| `MAX_UPLOAD_BYTES` | Maximum upload size | `10485760` |
| `ADMIN_EMAIL` | Seeded admin account email | `admin@ufms.hehe` |
| `ADMIN_PASSWORD` | Seeded admin account password | `Admin1234!` |
| `ADMIN_NAME` | Seeded admin display name | `System Administrator` |

## Local Development

You can run the backend and frontend separately during development.

### 1. Start PostgreSQL

Use Docker Compose for the database:

```bash
docker compose up db
```

If you run only the database service, set the backend connection string to match Compose:

```bash
export DATABASE_URL=postgresql://postgres:secret@localhost:5432/ufms
```

### 2. Set Up the Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m scripts.seed_admin
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:

```text
API:        http://localhost:8000/api/v1
Docs:       http://localhost:8000/api/docs
Health:     http://localhost:8000/health
```

### 3. Set Up the Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs at:

```text
http://localhost:5173
```

The frontend proxies `/api` and `/uploads` to `http://localhost:8000`.

## Common Commands

```bash
# Run the full application stack
docker compose up --build

# Stop containers
docker compose down

# Stop containers and remove the database volume
docker compose down -v

# Run database migrations
alembic upgrade head

# Create the initial admin account
python -m scripts.seed_admin

# Run the backend locally
uvicorn app.main:app --reload

# Build the frontend
cd frontend && npm run build

# Run Python tests
pytest
```

## Application Routes

Frontend routes:

| Route | Access | Purpose |
|---|---|---|
| `/login` | Public | Sign in |
| `/register` | Public | Create a customer account |
| `/dashboard` | Authenticated | Customer overview |
| `/dashboard/my-tickets` | Authenticated | Customer ticket list |
| `/dashboard/new-ticket` | Authenticated | Submit a ticket |
| `/dashboard/faq` | Authenticated | FAQ browser |
| `/agent/tickets` | Agent or admin | Staff ticket queue |
| `/admin/users` | Admin | User management |
| `/admin/create-user` | Admin | Create users with roles |
| `/admin/ticket-categories` | Admin | Manage ticket categories |
| `/admin/tickets` | Admin | All-ticket oversight |
| `/admin/faq` | Admin | FAQ management |
| `/public` | Public | Browse resolved public tickets |

API groups:

| Prefix | Purpose |
|---|---|
| `/api/v1/auth` | Register, login, refresh, logout, current user |
| `/api/v1/tickets` | Customer tickets, public tickets, messages, attachments, status, assignment |
| `/api/v1/agent` | Agent-visible ticket queue and details |
| `/api/v1/admin` | Users, roles, ticket oversight, priorities, ticket categories |
| `/api/v1/faq` | FAQ search/list/detail/upvote/import/admin CRUD |

## Ticket Lifecycle

Tickets use the following statuses:

```text
open -> in_progress -> pending_customer -> resolved -> closed
```

Agents and admins can claim tickets, add public replies or internal notes, transfer categories, and move assigned tickets through the lifecycle. Customers can reply to their own tickets and close or reopen tickets when allowed by the state rules.

## Attachments

Ticket attachments are stored on disk under `UPLOAD_DIR`.

Allowed file types:

```text
JPEG, PNG, GIF, WEBP, PDF
```

Maximum file size:

```text
10 MB
```

## Notes

- `DOCUMENTATION.md` contains a more detailed architecture and module reference.
- The production Docker image serves the built React app through FastAPI, so only port `8000` is exposed.
- Change `SECRET_KEY` and the seeded admin password before using the app outside local development.
