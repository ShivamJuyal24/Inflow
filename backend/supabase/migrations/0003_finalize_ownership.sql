-- Step 9: Finalize ownership invariants.
--
-- Existing legacy rows cannot be safely attributed to an authenticated user:
-- auth.users currently contains no users, while legacy ownership columns are NULL.
-- Do not infer ownership from account_email.
--
-- Delete orphaned legacy emails first. Their dependent drafts and email_actions
-- are removed automatically through existing ON DELETE CASCADE constraints.
DELETE FROM public.emails
WHERE google_account_id IS NULL;

-- Remove orphaned legacy Google accounts.
DELETE FROM public.google_accounts
WHERE user_id IS NULL;

-- From this point onward, ownership is mandatory at the database level.
ALTER TABLE public.google_accounts
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.emails
  ALTER COLUMN google_account_id SET NOT NULL;