CREATE TABLE users (
    id text PRIMARY KEY,
    role text NOT NULL CHECK (role IN ('resident', 'technician'))
);

CREATE TABLE repair_requests (
    id uuid PRIMARY KEY,
    resident_id text NOT NULL REFERENCES users (id),
    assignee_id text REFERENCES users (id),
    idempotency_key text NOT NULL,
    location text NOT NULL CHECK (char_length(location) BETWEEN 1 AND 120),
    category text NOT NULL CHECK (category IN ('plumbing', 'electrical', 'furniture', 'other')),
    description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1200),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (resident_id, idempotency_key),
    CHECK ((status = 'open') = (assignee_id IS NULL))
);

CREATE TABLE request_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id uuid NOT NULL REFERENCES repair_requests (id),
    previous_status text,
    status text NOT NULL,
    actor_id text NOT NULL REFERENCES users (id),
    note text,
    at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (
        (previous_status IS NULL AND status = 'open' AND note IS NULL)
        OR (previous_status IS NOT DISTINCT FROM 'open' AND status = 'in_progress' AND note IS NULL)
        OR (previous_status IS NOT DISTINCT FROM 'in_progress' AND status = 'resolved'
            AND note IS NOT NULL AND char_length(note) BETWEEN 1 AND 600)
    )
);

-- This is a new empty table. Indexes on populated tables use the separate index step.
CREATE INDEX request_events_request_order ON request_events (request_id, id);
