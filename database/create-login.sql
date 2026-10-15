-- Create your dashboard login.
--
-- 1. Open your project at neon.tech and click SQL Editor.
-- 2. Paste this whole file.
-- 3. Change the email, name and password on the INSERT line below (keep the quotes).
-- 4. Click Run. Then sign in at https://<your-site>/#/admin with that email and password.
--
-- Running it again with the same email changes that login's password, so it doubles as
-- "reset my password". The password is hashed by Postgres (bcrypt) before it's saved.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

INSERT INTO admin_users (email, name, password_hash)
VALUES ('santeriatech@atomicmail.io', 'Owner', crypt('CHANGE-ME-to-a-long-password', gen_salt('bf', 10)))
ON CONFLICT (email) DO UPDATE
  SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash;

-- Signs out every device using that login, so the new password takes effect everywhere.
-- (Skipped automatically the very first time, before the API has created this table.)
DO $$ BEGIN
  IF to_regclass('admin_sessions') IS NOT NULL THEN
    DELETE FROM admin_sessions
    WHERE user_id = (SELECT id FROM admin_users WHERE email = 'santeriatech@atomicmail.io');
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- More things you can run (copy one line at a time, change the details):
--
-- Add a second person:
--   INSERT INTO admin_users (email, name, password_hash)
--   VALUES ('oswaldamoah00@gmail.com', 'Your name', crypt('another-long-password', gen_salt('bf', 10)));
--
-- See who can sign in:
--   SELECT email, name, created_at, last_login_at FROM admin_users ORDER BY id;
--
-- Remove someone's access (also signs them out):
--   DELETE FROM admin_users WHERE email = 'someone@example.com';
--
-- Sign everyone out:
--   DELETE FROM admin_sessions;
