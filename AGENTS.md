# AGENTS.md — Slashy / Inflow

Persistent context for coding sessions. This document reflects the current repository state.

## What this is

Inflow (`slashy`) is a multi-user Gmail triage application. Users sign in with Supabase Auth, connect their Gmail mailbox via Google OAuth, and the system periodically fetches inbox emails, persists them in Supabase, classifies them (deterministic Gmail-label shortcuts first, then an LLM), derives durable actions, and generates reply drafts for `DRAFT_REPLY` actions. Drafts move through a human approval gate before anything is sent.

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, TypeScript (strict, `NodeNext` ESM imports with `.js` extensions), Express 5 |
| Frontend | React 19, Vite 8, Tailwind CSS 4, react-router-dom 7 |
| Database / Auth | Supabase Postgres via `@supabase/supabase-js`, Supabase Auth |
| Orchestration | LangGraph (`@langchain/langgraph`) |
| OAuth / Email | Google OAuth 2.0 and Gmail API via `googleapis` |
| Classification | Jev API (`https://jevmodel.org/v1/systemone`, model `jev-latest`) |
| Draft generation | Groq SDK, `openai/gpt-oss-120b`, temperature 0.3 |
| Validation | Zod 4 |
| Tests | Vitest (backend), Testing Library + jsdom (frontend devDeps) |

Google OAuth scopes: `openid`, `email`, `profile`, `gmail.readonly`, `gmail.send`, `calendar.readonly`.

## Repository layout

```text
slashy/
├── AGENTS.md / CLAUDE.md / README.md
├── backend/
│   ├── .env                  # not committed
│   ├── .env.example          # committed template
│   └── src/
│       ├── server.ts         # listen + startup/scheduled triage
│       ├── app.ts            # express app, route mounting, /api/health
│       ├── config/           # google, googleScopes, supabase, groq, gmailSync
│       ├── controllers/      # auth, email, draft, triage
│       ├── middleware/       # auth.middleware.ts (requireAuth)
│       ├── routes/           # auth/email/draft/triage routers
│       ├── graph/            # graph.ts, nodes.ts, state.ts, actionMapper.ts,
│       │                     # jevClassifier.ts, testGraph.ts, testRouting.ts, testDraft.ts
│       ├── services/         # gmail.service.ts, email.parser.ts, triage.service.ts,
│       │                     # emailSync.service.ts (unused by scheduler)
│       ├── test/             # shared test mocks (fakeSupabase, supabase, gmail)
│       └── types/            # email, classification, action, draft, triage
└── frontend/
    └── src/
        ├── main.tsx          # mounts <AuthProvider><App/></AuthProvider>
        ├── App.tsx           # BrowserRouter + route table
        ├── auth/             # AuthProvider.tsx (Supabase session)
        ├── components/
        │   ├── auth/         # ProtectedRoute.tsx
        │   ├── layout/       # AppShell.tsx, NavRail.tsx
        │   ├── ui/           # shadcn-style primitives
        │   ├── ai/           # CommandSidebar.tsx
        │   └── …             # DraftCard, DraftDetail, EmailDetail, InboxList, TriageRunButton
        ├── lib/              # supabase.ts, apiClient.ts, emailApi.ts, draftApi.ts,
        │                     # triageApi.ts, connectionApi.ts, utils.ts
        ├── pages/            # Landing, Login, SignUp, Dashboard, Drafts
        └── types/            # email, draft, triage
```

## Authentication model (two separate layers)

1. **App sign-in (Supabase Auth).** The frontend signs users in with email/password (`AuthProvider`), and every protected API call sends `Authorization: Bearer <supabase access_token>`, attached by `lib/apiClient.ts` (`apiFetch`). `middleware/auth.middleware.ts` (`requireAuth`) validates it via `supabase.auth.getUser` and sets `req.user.id`.
2. **Gmail mailbox authorization (Google OAuth).** Separate flow: `GET /api/auth/google` (requires app sign-in) returns `{ url }` for the frontend to navigate to; the Google callback stores the refresh token in `google_accounts` (keyed by the account's email, upserted with `user_id` from the signed OAuth state) and redirects to `${FRONTEND_URL}/dashboard?gmail=connected`.

Sign-in alone does **not** connect Gmail — the dashboard shows a "Connect Gmail" card until `GET /api/auth/google/status` reports `{ connected: true }`.

## LangGraph pipeline

`graph/graph.ts`:

```text
START → fetch → persist → classify → action → routeActions
  END | draftWorkFlow | meetingWorkFlow → END
```

- **fetchNode** — loads the user's Google account (scoped by `state.userId`), pages Gmail via `getGmailSyncConfig()`, parses messages with `parseGmailMessage` (body prefers `text/plain`, falls back to stripped HTML; also captures `labelIds` into `Email.labels`).
- **persistNode** — upserts new emails into `emails` (dedup by `message_id`).
- **classifyNode** — see below.
- **actionNode** — maps categories to action types via `actionMapper.ts`, inserts new `email_actions` rows idempotently on `(message_id, action_type)`.
- **routeActions** — any `DRAFT_REPLY` → `draftWorkFlow`; any `ANALYZE_MEETING` → `meetingWorkFlow` (stub); both → both; else END.
- **draftNode** — for `DRAFT_REPLY` actions without an existing draft, generates a Groq reply (`llama`-class model `openai/gpt-oss-120b`, temp 0.3, up to 8000 body chars), stores a `PENDING_REVIEW` draft, and marks the action `COMPLETED`.

Classifications persist to `emails.category` / `classification_reason` / `suggested_action` / `classified_at`. Emails with a non-null `category` are skipped on later runs (`existingMap` in classifyNode), so reruns only process new or previously failed emails.

### Classification cost controls (current)

- **Deterministic label shortcut:** emails labeled `CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, or `CATEGORY_FORUMS` are persisted as `LOW_PRIORITY` immediately — no LLM call. `CATEGORY_UPDATES` and `CATEGORY_PRIMARY` still go through the LLM (Updates can carry receipts/security mail).
- **Fetch query:** `in:inbox -category:promotions -category:social -category:updates`.
- **Body sampling:** `jevClassifier.cleanEmailBody` strips URLs/whitespace and keeps head (~70%) + tail (~30%) of at most 1200 chars.
- **Batch caps:** `GMAIL_PAGE_SIZE` (default 100, max 500), `GMAIL_MAX_MESSAGES` (local `.env` set to 10), `GMAIL_MAX_SCAN` (local `.env` set to 200).
- **Pacing:** 3000 ms between classification and draft provider calls; 429 stops the batch early and leaves the rest for the next run.

## State and contracts

`EmailTriageState`: `userId`, `googleAccountId`, `accountEmail`, `emails`, `classification`, `actions`, `drafts`, `calendarSlots`, `approvalStatus`. Array reducers replace (`(_, next) => next`), never append.

`Email` (`types/email.ts`): `id`, `threadId`, `from`, `to`, `subject`, `body`, `receivedAt`, `labels?`.

Categories: `SPAM`, `LOW_PRIORITY`, `INFORMATIONAL`, `REQUIRES_REPLY`, `MEETING`, `IMPORTANT`.
Actions: `STORE` | `REVIEW` | `DRAFT_REPLY` | `ANALYZE_MEETING`; statuses `PENDING` | `COMPLETED` | `FAILED`.
Draft statuses: `PENDING_REVIEW` | `APPROVED` | `REJECTED` | `SENDING` | `SEND_UNCERTAIN` | `SENT`.

## Supabase tables (inferred from queries)

- `google_accounts` — `id`, `email`, `user_id`, `refresh_token`, `created_at`, `updated_at`
- `emails` — `id` (uuid), `message_id`, `thread_id`, `account_email`, `google_account_id`, `from_email`, `to_email`, `subject`, `body`, `received_at`, `category`, `classification_reason`, `suggested_action`, `classified_at`
- `email_actions` — `message_id`, `action_type`, `status`
- `drafts` — `id`, `email_id`, `body`, `status`, timestamps

## HTTP API

All routes below are behind `requireAuth` unless noted.

- `GET /api/health` (open)
- `GET /api/auth/google` → `{ url }`
- `GET /api/auth/google/callback` (open; validated via signed OAuth state + nonce cookie)
- `GET /api/auth/google/status` → `{ connected, email }`
- `GET /api/emails` (`page`, `limit`, `category`, `q`), `GET /api/emails/:id`, `POST /api/emails/sync`
- `POST /api/triage/run` → 409 if already running, 400 if no Gmail account connected
- `GET /api/drafts`, `GET /api/drafts/:emailId`, `PATCH /api/drafts/:emailId`, `POST .../approve|reject|send|resolve-send`

Draft send rules: only `APPROVED` → `SENT` (status `SENDING` claimed first; `SEND_UNCERTAIN` + `resolve-send` reconciles timeouts); PATCH allowed only while `PENDING_REVIEW`; transitions to wrong states return 409.

## Environment variables

Backend (`backend/.env`, see `.env.example`):

```text
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
SUPABASE_URL, SUPABASE_SECRET_KEY, GROQ_API_KEY, JEVMODEL_API_KEY
PORT (default 5000), FRONTEND_URL, SYNC_INTERVAL_MS (default 300000)
GMAIL_PAGE_SIZE, GMAIL_MAX_MESSAGES, GMAIL_MAX_SCAN
```

Frontend (`frontend/.env`, see `.env.example`): `VITE_API_URL` (`/api` via Vite proxy locally), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Frontend behavior

- `/` Landing (public), `/login` + `/signup` (redirect to `/dashboard` when signed in), `/dashboard` + `/drafts` (protected), `*` → `/`.
- Dashboard: inbox list with category filters, search, pagination; Gmail connection card when `connected === false`; triage button only when connected; email detail or DraftDetail for selection; `?gmail=connected` banner.
- Drafts: list + detail view with edit (while PENDING_REVIEW), approve/reject/send/resolve-send.
- NavRail: category filters plus "Drafts" link and "Sign out".

## Scripts and verification

Backend (`backend/`): `npm run dev`, `npm run build` (tsc → dist), `npm run start`, `npm test` / `test:watch` (Vitest), `npm run graph|gmail|draft` (live scripts, need real credentials).
Frontend (`frontend/`): `npm run dev`, `npm run build` (`tsc -b && vite build`), `npm run lint`, `npm test` if configured.

Conventions: create controllers/routes against `requireAuth`; scope every query by `req.user.id` → `google_account_id`; keep `.env` out of Git; smallest consistent diffs; report real command output.
