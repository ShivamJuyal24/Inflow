-- Follow-up drafts must coexist with the original draft for the same email:
-- one email can have one 'reply' draft AND one 'follow_up' draft.
--
-- Replace the single-column uniqueness with a composite one so:
--   - a second 'reply' upsert for the same email is still idempotent
--   - a 'follow_up' row for the same email is allowed
--   - at most one follow_up row can exist per email (hard cap, even if code
--     misfires twice)

DROP INDEX IF EXISTS public.uq_drafts_email_id;

CREATE UNIQUE INDEX uq_drafts_email_kind ON public.drafts (email_id, kind);
