-- Follow-up tracking on drafts.
--
-- sent_at: set when a draft reaches SENT; basis for the 3-day follow-up clock.
-- followed_up_at: set when a follow-up draft has been generated for this draft
--   (or when we learn a reply already arrived, so we never nag twice).
-- follow_up_count: how many follow-up drafts this draft has spawned (cap: 1).
-- kind: distinguishes normal drafts from follow-up drafts in the UI.

ALTER TABLE public.drafts
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS followed_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reply';

-- Eligible-scan index: sweep only cares about SENT drafts pending a follow-up.
CREATE INDEX IF NOT EXISTS drafts_followup_scan_idx
  ON public.drafts (sent_at)
  WHERE status = 'SENT' AND followed_up_at IS NULL;
