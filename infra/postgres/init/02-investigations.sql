CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.investigations (
    investigation_id text PRIMARY KEY CHECK (investigation_id ~ '^[A-Za-z0-9_-]{1,100}$'),
    plan jsonb NOT NULL,
    access_token_hash text NOT NULL CHECK (access_token_hash ~ '^[0-9a-f]{64}$'),
    record jsonb,
    evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    finalized_at timestamptz,
    CONSTRAINT investigation_terminal_pair CHECK ((record IS NULL) = (finalized_at IS NULL))
);

REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON app.investigations FROM PUBLIC;
