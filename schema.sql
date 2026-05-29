-- =============================================================================
-- UFMS — PostgreSQL Database Schema
-- Generated from: app/storage/models.py
-- Apply with:  psql -d ufms -f schema.sql
-- =============================================================================

-- Enable pgcrypto for gen_random_uuid() if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

CREATE TYPE userrole AS ENUM (
    'customer',
    'agent',
    'admin'
);

CREATE TYPE ticketcategory AS ENUM (
    'billing',
    'delays',
    'lost_found',
    'route',
    'other'
);

CREATE TYPE ticketpriority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);

CREATE TYPE ticketstatus AS ENUM (
    'open',
    'in_progress',
    'pending_customer',
    'resolved',
    'closed'
);

-- =============================================================================
-- TABLE: users
-- =============================================================================

CREATE TABLE users (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    email           VARCHAR(255)    NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    full_name       VARCHAR(255)    NOT NULL,
    role            userrole        NOT NULL DEFAULT 'customer',
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT pk_users PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_users_email ON users (email);

-- =============================================================================
-- TABLE: tickets
-- =============================================================================

CREATE TABLE tickets (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    ticket_number   VARCHAR(20)     NOT NULL,
    user_id         UUID            NOT NULL,
    assigned_to     UUID,
    subject         VARCHAR(255)    NOT NULL,
    description     TEXT            NOT NULL,
    category        ticketcategory  NOT NULL,
    priority        ticketpriority  NOT NULL DEFAULT 'normal',
    status          ticketstatus    NOT NULL DEFAULT 'open',
    is_public       BOOLEAN         NOT NULL DEFAULT FALSE,
    search_vector   TSVECTOR,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT pk_tickets PRIMARY KEY (id),
    CONSTRAINT fk_tickets_user_id
        FOREIGN KEY (user_id)   REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_assigned_to
        FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX ix_tickets_ticket_number  ON tickets (ticket_number);
CREATE INDEX        ix_tickets_search_vector  ON tickets USING GIN (search_vector);

-- =============================================================================
-- TABLE: faq_items
-- =============================================================================

CREATE TABLE faq_items (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    question        VARCHAR(500)    NOT NULL,
    answer          TEXT            NOT NULL,
    category        VARCHAR(100)    NOT NULL,
    tags            TEXT[],
    view_count      INTEGER         NOT NULL DEFAULT 0,
    upvote_count    INTEGER         NOT NULL DEFAULT 0,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    search_vector   TSVECTOR,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT pk_faq_items PRIMARY KEY (id)
);

CREATE INDEX ix_faq_items_search_vector ON faq_items USING GIN (search_vector);

-- =============================================================================
-- TABLE: faq_upvotes
-- =============================================================================

CREATE TABLE faq_upvotes (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    faq_id      UUID        NOT NULL,
    user_id     UUID        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_faq_upvotes PRIMARY KEY (id),
    CONSTRAINT uq_faq_upvotes_faq_user UNIQUE (faq_id, user_id),
    CONSTRAINT fk_faq_upvotes_faq_id
        FOREIGN KEY (faq_id) REFERENCES faq_items (id) ON DELETE CASCADE,
    CONSTRAINT fk_faq_upvotes_user_id
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_faq_upvotes_faq_id  ON faq_upvotes (faq_id);
CREATE INDEX ix_faq_upvotes_user_id ON faq_upvotes (user_id);

-- =============================================================================
-- TABLE: ticket_messages
-- =============================================================================

CREATE TABLE ticket_messages (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    ticket_id   UUID        NOT NULL,
    sender_id   UUID        NOT NULL,
    content     TEXT        NOT NULL,
    is_internal BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_ticket_messages PRIMARY KEY (id),
    CONSTRAINT fk_ticket_messages_ticket_id
        FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_messages_sender_id
        FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE RESTRICT
);

-- =============================================================================
-- TABLE: attachments
-- =============================================================================

CREATE TABLE attachments (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    ticket_id       UUID            NOT NULL,
    message_id      UUID,
    filename        VARCHAR(255)    NOT NULL,
    storage_path    VARCHAR(500)    NOT NULL,
    mime_type       VARCHAR(100)    NOT NULL,
    file_size       INTEGER         NOT NULL,

    CONSTRAINT pk_attachments PRIMARY KEY (id),
    CONSTRAINT fk_attachments_ticket_id
        FOREIGN KEY (ticket_id)  REFERENCES tickets (id)         ON DELETE CASCADE,
    CONSTRAINT fk_attachments_message_id
        FOREIGN KEY (message_id) REFERENCES ticket_messages (id) ON DELETE SET NULL
);

-- =============================================================================
-- TABLE: ticket_status_history
-- =============================================================================

CREATE TABLE ticket_status_history (
    id          UUID            NOT NULL DEFAULT gen_random_uuid(),
    ticket_id   UUID            NOT NULL,
    changed_by  UUID            NOT NULL,
    old_status  ticketstatus,               -- NULL for the initial Open entry
    new_status  ticketstatus    NOT NULL,
    note        TEXT,
    changed_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),

    CONSTRAINT pk_ticket_status_history PRIMARY KEY (id),
    CONSTRAINT fk_tsh_ticket_id
        FOREIGN KEY (ticket_id)  REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_tsh_changed_by
        FOREIGN KEY (changed_by) REFERENCES users (id)   ON DELETE RESTRICT
);

-- =============================================================================
-- TRIGGER: auto-update tickets.search_vector on INSERT / UPDATE
-- =============================================================================

CREATE OR REPLACE FUNCTION tickets_tsvector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.subject, '')),      'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')),  'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_tsvector_trigger
    BEFORE INSERT OR UPDATE OF subject, description
    ON tickets
    FOR EACH ROW EXECUTE FUNCTION tickets_tsvector_update();

-- =============================================================================
-- TRIGGER: auto-update faq_items.search_vector on INSERT / UPDATE
-- =============================================================================

CREATE OR REPLACE FUNCTION faq_items_tsvector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.question, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.answer,    '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER faq_items_tsvector_trigger
    BEFORE INSERT OR UPDATE OF question, answer
    ON faq_items
    FOR EACH ROW EXECUTE FUNCTION faq_items_tsvector_update();
