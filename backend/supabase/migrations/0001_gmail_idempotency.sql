-- 0001_gmail_idempotency.sql
--
-- Phase 1: database-enforced idempotency for Gmail email sync.
--
-- The backend now relies on atomic upserts with conflict targets:
--   emails         ON CONFLICT (message_id)
--   email_actions  ON CONFLICT (message_id, action_type)
--   drafts         ON CONFLICT (email_id)            [already assumed by draftNode]
--
-- For those upserts to be race-proof, each conflict target must be
-- backed by a UNIQUE constraint/index. This migration:
--   1. De-duplicates existing rows (required before the indexes can be
--      created; duplicate (message_id) rows and duplicate
--      (message_id, action_type) rows can exist because persistence
--      used to be application-level check-then-insert).
--   2. Backfills emails.account_email with the connected Google
--      account's address (it used to be stored from the message's To
--      header, which is wrong for aliases and forwarded mail).
--   3. Creates the unique indexes, but ONLY when an equivalent unique
--      constraint/index does not already exist.
--
-- The script is idempotent: every step either no-ops when there is
-- nothing to do or is guarded by a catalog check, so it can be re-run
-- safely.
--
-- HOW TO APPLY
-- ------------
-- Option A (Supabase Dashboard): open your project → SQL Editor → paste
--   this file → Run. The editor executes the whole script as one
--   transaction.
-- Option B (psql / supabase CLI):
--   psql "$DATABASE_URL" -f backend/supabase/migrations/0001_gmail_idempotency.sql
--   (or `supabase db push` if you adopt the CLI migration workflow)
--
-- PRE-FLIGHT (optional, read-only — see what would change):
--   SELECT message_id, count(*) FROM emails GROUP BY 1 HAVING count(*) > 1;
--   SELECT message_id, action_type, count(*) FROM email_actions GROUP BY 1,2 HAVING count(*) > 1;
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename IN ('emails','email_actions','drafts');

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1a. De-duplicate emails by message_id.
-- Keeps, per message_id: a row referenced by a draft first, then the
-- oldest received_at. Deleting duplicates before creating the unique
-- index also keeps drafts' FK targets intact where possible.
-- ─────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT e.id,
         ROW_NUMBER() OVER (
           PARTITION BY e.message_id
           ORDER BY (d.email_id IS NOT NULL) DESC,
                    e.received_at ASC,
                    e.ctid
         ) AS rn
  FROM emails e
  LEFT JOIN LATERAL (
    SELECT d.email_id FROM drafts d WHERE d.email_id = e.id LIMIT 1
  ) d ON true
)
DELETE FROM emails
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ─────────────────────────────────────────────────────────────
-- 1b. Backfill account attribution with the connected account.
-- Single-user deployment: the first google_accounts row is the mailbox
-- owner. No-op when there are no accounts or when already correct.
-- ─────────────────────────────────────────────────────────────
UPDATE emails
SET account_email = ga.email
FROM (
  SELECT email FROM google_accounts ORDER BY created_at ASC LIMIT 1
) ga
WHERE emails.account_email IS DISTINCT FROM ga.email;

-- ─────────────────────────────────────────────────────────────
-- 1c. Unique index on emails(message_id) — target of the emails
-- upsert. Created only if no equivalent unique constraint/index
-- already exists.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    -- unique/pk CONSTRAINT covering exactly (message_id)
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'emails'
      AND c.contype IN ('u', 'p')
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attnum)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      ) = ARRAY['message_id']
  ) AND NOT EXISTS (
    -- pre-existing UNIQUE INDEX on exactly (message_id)
    SELECT 1 FROM pg_indexes i
    WHERE i.tablename = 'emails'
      AND i.indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND i.indexdef ~ '\(message_id\)$'
  ) THEN
    CREATE UNIQUE INDEX uq_emails_message_id ON emails (message_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2a. De-duplicate email_actions by (message_id, action_type).
-- Keeps the most progressed status: COMPLETED > PENDING > FAILED
-- (a kept PENDING row stays retryable).
-- ─────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT a.ctid,
         ROW_NUMBER() OVER (
           PARTITION BY a.message_id, a.action_type
           ORDER BY CASE a.status
                      WHEN 'COMPLETED' THEN 0
                      WHEN 'PENDING' THEN 1
                      ELSE 2
                    END,
                    a.ctid
         ) AS rn
  FROM email_actions a
)
DELETE FROM email_actions
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

-- ─────────────────────────────────────────────────────────────
-- 2b. Unique index on email_actions(message_id, action_type) —
-- target of the email_actions upsert. Guarded as above.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'email_actions'
      AND c.contype IN ('u', 'p')
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      ) = ARRAY['action_type', 'message_id']
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.tablename = 'email_actions'
      AND i.indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND i.indexdef ~ '\(message_id, action_type\)$'
  ) THEN
    CREATE UNIQUE INDEX uq_email_actions_message_id_action_type
      ON email_actions (message_id, action_type);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. drafts.email_id must be unique — draftNode already upserts on it.
-- Deduplicate first (keeping the most advanced status), then create
-- the index only if missing.
-- ─────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT d.ctid,
         ROW_NUMBER() OVER (
           PARTITION BY d.email_id
           ORDER BY CASE d.status
                      WHEN 'SENT' THEN 0
                      WHEN 'APPROVED' THEN 1
                      WHEN 'PENDING_REVIEW' THEN 2
                      ELSE 3
                    END,
                    d.ctid
         ) AS rn
  FROM drafts d
)
DELETE FROM drafts
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'drafts'
      AND c.contype IN ('u', 'p')
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attnum)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      ) = ARRAY['email_id']
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.tablename = 'drafts'
      AND i.indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND i.indexdef ~ '\(email_id\)$'
  ) THEN
    CREATE UNIQUE INDEX uq_drafts_email_id ON drafts (email_id);
  END IF;
END $$;

COMMIT;

-- POST-FLIGHT (optional, read-only):
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename IN ('emails','email_actions','drafts')
--      AND indexdef ILIKE 'CREATE UNIQUE INDEX%';
