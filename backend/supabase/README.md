# Supabase migrations

The project's schema currently lives only in Supabase (no committed
migrations existed before this directory). New schema changes are
recorded here as plain SQL files, numbered in application order:

```
0001_gmail_idempotency.sql   unique indexes + dedupe for idempotent upserts
```

## Applying

Run each new file once against the project database, in order:

- **Supabase Dashboard** → SQL Editor → paste the file → Run, or
- `psql "$DATABASE_URL" -f backend/supabase/migrations/<file>.sql`

Scripts in this directory are written to be idempotent (guarded by
catalog checks), so an accidental re-run is safe.

## Conventions

- One concern per numbered file; never edit an already-applied file —
  add a new one instead.
- Every `CREATE UNIQUE INDEX` / constraint must be preceded by a
  de-duplication step and guarded by a catalog check (see 0001 for the
  pattern) so it applies cleanly to databases whose history we cannot
  inspect.
