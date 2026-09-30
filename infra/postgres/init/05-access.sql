-- One-company local identities. Credentials and grants are provisioned by an operator.
CREATE TABLE IF NOT EXISTS app.users (
  user_id text PRIMARY KEY CHECK (user_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'restricted')),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS app.user_customer_scopes (
  user_id text NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  PRIMARY KEY (user_id, customer_id)
);
CREATE TABLE IF NOT EXISTS app.sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id text NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS app.investigation_owners (
  investigation_id text PRIMARY KEY REFERENCES app.investigations(investigation_id),
  user_id text NOT NULL REFERENCES app.users(user_id)
);
REVOKE ALL ON app.users, app.user_customer_scopes, app.sessions, app.investigation_owners FROM PUBLIC;
