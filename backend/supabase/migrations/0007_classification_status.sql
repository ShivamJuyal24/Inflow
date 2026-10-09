-- Step: Add classification tracking columns
--
-- classification_status: pending | classified | failed
-- classification_error: error text when classification fails permanently
-- classifier_model: which classifier produced the result (groq, jev, rules)

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS classification_status text
    CHECK (classification_status IN ('pending', 'classified', 'failed'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS classification_error text,
  ADD COLUMN IF NOT EXISTS classifier_model text;

-- Backfill: emails with a category are classified, null category are pending
UPDATE public.emails
SET classification_status = CASE
    WHEN category IS NOT NULL THEN 'classified'
    ELSE 'pending'
END;

-- Index for selecting pending emails efficiently
CREATE INDEX IF NOT EXISTS emails_classification_status_idx
  ON public.emails (classification_status)
  WHERE classification_status = 'pending';