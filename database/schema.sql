-- Santeria Tech: every table the API uses.
--
-- You don't have to run this. The API creates these tables by itself the first time it
-- connects to your database. It's here so you can see what's stored, or set the database up
-- before the API is deployed: paste it into Neon > SQL Editor and click Run. Running it
-- again is safe; it only creates what's missing.

-- Lets Postgres hash and check passwords (bcrypt) for dashboard logins.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One row per purchase order a seller sends.
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,                 -- the order number shown to the seller, like ST-4KD-9QX
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new',        -- new, contacted, scheduled, received, paid, cancelled
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  social TEXT NOT NULL DEFAULT '',
  prefer TEXT NOT NULL DEFAULT 'email',      -- how the seller wants to be contacted
  note TEXT NOT NULL DEFAULT '',
  quoted_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_total NUMERIC(12,2),                 -- what you actually paid, after checking the devices
  item_count INT NOT NULL DEFAULT 0,
  admin_notes TEXT NOT NULL DEFAULT '',      -- your private notes
  contacted_at TIMESTAMPTZ,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  page TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

-- The devices in each order, with the price quoted at the time.
CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  qty INT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

-- Each order's history (received, emailed, status changes, notes).
CREATE TABLE IF NOT EXISTS order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, at);

-- People who can sign in to the dashboard. Passwords are stored as bcrypt hashes, never as text.
-- Add logins with database/create-login.sql.
CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Who is signed in right now. Only a hash of each session token is kept; a session lasts 12 hours.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON admin_sessions (user_id);
