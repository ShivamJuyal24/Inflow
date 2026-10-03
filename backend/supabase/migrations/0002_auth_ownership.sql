-- 0002_auth_ownership.sql
--
-- Phase 2: establish the ownership relationships needed for
-- Supabase Auth-backed multi-user isolation.
--
-- Ownership chain:
--   auth.users.id
--       ↓
--   google_accounts.user_id
--       ↓
--   emails.google_account_id
--
-- Existing rows are intentionally NOT backfilled here.
-- The current database contains legacy single-user data and
-- inconsistent account_email values. Ownership must be assigned
-- explicitly in a later migration/workflow rather than inferred
-- from email strings.

BEGIN;

-- ------------------------------------------------------------------
-- 1. Associate each Google account with its authenticated Supabase user.
--
-- Nullable for now because existing google_accounts rows predate
-- Supabase Auth ownership.
-- ------------------------------------------------------------------

ALTER TABLE google_accounts
ADD COLUMN IF NOT EXISTS user_id uuid;

-- ------------------------------------------------------------------
-- 2. Associate each email with the Google account that owns it.
--
-- Nullable for now because existing emails have not yet been
-- safely backfilled to a specific Google account.
-- ------------------------------------------------------------------

ALTER TABLE emails
ADD COLUMN IF NOT EXISTS google_account_id uuid;

-- ------------------------------------------------------------------
-- 3. Enforce the ownership relationships.
--
-- Existing rows are valid because both new columns are nullable.
-- ------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'google_accounts_user_id_fkey'
      AND conrelid = 'google_accounts'::regclass
  ) THEN
    ALTER TABLE google_accounts
      ADD CONSTRAINT google_accounts_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'emails_google_account_id_fkey'
      AND conrelid = 'emails'::regclass
  ) THEN
    ALTER TABLE emails
      ADD CONSTRAINT emails_google_account_id_fkey
      FOREIGN KEY (google_account_id)
      REFERENCES google_accounts(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 4. Index the ownership lookup paths.
--
-- These are non-unique indexes because:
--   - one Supabase user may have multiple Google accounts
--   - one Google account owns many emails
-- ------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_google_accounts_user_id
  ON google_accounts (user_id);

CREATE INDEX IF NOT EXISTS idx_emails_google_account_id
  ON emails (google_account_id);

COMMIT;

-- POST-FLIGHT (optional, read-only):
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('google_accounts', 'emails')
--   AND column_name IN ('user_id', 'google_account_id')
-- ORDER BY table_name, column_name;
--
-- SELECT
--   tc.table_name,
--   tc.constraint_name,
--   kcu.column_name,
--   ccu.table_schema AS foreign_table_schema,
--   ccu.table_name AS foreign_table_name,
--   ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.constraint_name IN (
--     'google_accounts_user_id_fkey',
--     'emails_google_account_id_fkey'
--   );