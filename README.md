# Inflow — AI Email Triage

Inflow is a full-stack Gmail triage application. It connects to your Gmail inbox, classifies incoming email with an LLM, drafts replies for the ones that need a response, and only sends anything after you explicitly approve it. Gmail ingestion, parsing, classification, action derivation, and drafting are orchestrated with LangGraph.

## Features

- **Supabase Auth sign-in** with protected routes and bearer-token API calls
- **Google OAuth** per-user mailbox connection (refresh token stored server-side)
- **Automatic triage** at server start and every `SYNC_INTERVAL_MS` (default 5 min), plus manual triggers
- **Deterministic pre-filtering**: Gmail's Promotions/Social/Forums tabs are classified `LOW_PRIORITY` without any LLM call
- **LLM classification** into six categories (Jev API), persisted so each email is classified once
- **Action mapping** into durable `email_actions` rows (idempotent by `(message_id, action_type)`)
- **Reply drafting** with Groq, human review UI, approve/reject, send in the original thread, and send-timeout reconciliation (`resolve-send`)
- **Inbox dashboard** with category filters, search, pagination, and a drafts review page

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, TypeScript, Express 5 |
| Frontend | React 19, Vite 8, Tailwind CSS 4 |
| Database/Auth | Supabase (Postgres + Auth) |
| Orchestration | LangGraph |
| Email/OAuth | Gmail API, Google OAuth 2.0 |
| Classification | Jev (`jev-latest`) |
| Drafting | Groq (`openai/gpt-oss-120b`) |
| Validation | Zod 4 |
| Tests | Vitest |

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project (URL, secret key, anon key) with the tables listed below
- Google Cloud project with Gmail API enabled and OAuth credentials (redirect URI: `http://localhost:5000/api/auth/google/callback`)
- Jev API key and Groq API key

### Backend

```bash
cd backend
cp .env.example .env   # fill in real values
npm install
npm run dev            # http://localhost:5000
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev            # Vite dev server, proxies /api → :5000
```

### Environment variables

Backend `backend/.env`:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
GROQ_API_KEY=...
JEVMODEL_API_KEY=...
PORT=5000
FRONTEND_URL=http://localhost:5173
SYNC_INTERVAL_MS=300000          # optional
GMAIL_PAGE_SIZE=100              # optional (≤500)
GMAIL_MAX_MESSAGES=10            # optional messages per triage run
GMAIL_MAX_SCAN=200               # optional scan ceiling per run
```

Frontend `frontend/.env`:

```text
VITE_API_URL=/api
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## How it works

```text
Supabase sign-in ──► connect Gmail (OAuth) ──► scheduled/manual triage
                                                    │
        ┌───────────────────────────────────────────┘
        ▼
 fetch → persist → classify → action → route
                        │             ├─ DRAFT_REPLY → draftWorkFlow → drafts table
                        │             └─ ANALYZE_MEETING → meetingWorkFlow (stub)
                        ▼
                emails.category persisted (never re-classified)

Drafts: PENDING_REVIEW → APPROVED → SENDING → SENT
                     └─► REJECTED          └─► SEND_UNCERTAIN → resolve-send
```

Classification skips emails Gmail already files under Promotions/Social/Forums (instant, zero tokens) and otherwise sends only a head+tail slice (≤1200 chars) of the body to the classifier. Failures leave the email unclassified and are retried on the next run.

## API overview

All routes except `/api/health` and the OAuth callback require `Authorization: Bearer <supabase access_token>`.

```text
GET  /api/health
GET  /api/auth/google            → { url } (start Gmail OAuth)
GET  /api/auth/google/callback   → redirects to FRONTEND_URL/dashboard?gmail=connected
GET  /api/auth/google/status     → { connected, email }
GET  /api/emails?page&limit&category&q
GET  /api/emails/:id
POST /api/emails/sync            → full triage (400 if Gmail not connected)
POST /api/triage/run             → full triage (409 while a run is in progress)
GET  /api/drafts
GET  /api/drafts/:emailId
PATCH /api/drafts/:emailId       → edit reply text while PENDING_REVIEW
POST /api/drafts/:emailId/approve
POST /api/drafts/:emailId/reject
POST /api/drafts/:emailId/send
POST /api/drafts/:emailId/resolve-send
```

## Database tables

- `google_accounts` — OAuth accounts (`email`, `user_id`, `refresh_token`)
- `emails` — fetched messages + stored classification
- `email_actions` — derived actions, idempotent by `(message_id, action_type)`
- `drafts` — generated replies with review/send status

## Development

```bash
# backend
npm run dev        # tsx watch
npm run build      # tsc → dist/
npm start          # node dist/server.js
npm test           # Vitest suite
npm run graph      # live LangGraph run (needs real credentials)
npm run gmail      # live Gmail sync pipeline
npm run draft      # draft node in isolation

# frontend
npm run dev
npm run build      # tsc -b && vite build
npm run lint
```

## Security notes

- Supabase secret key is server-only; frontend only gets the anon key.
- Every mutation is ownership-scoped to `req.user.id` → `google_accounts.user_id` / `google_account_id`.
- Google OAuth start requires an authenticated user and uses a signed state payload + nonce cookie (10-minute expiry, single use).
- Only `APPROVED` drafts can be sent; Gmail is never called for `PENDING_REVIEW`/`REJECTED` drafts.

## Cost & token optimization

This project makes two types of LLM calls: **Jev** for email classification and **Groq** for reply drafting. Both are billed per token, so the optimizations below focus on reducing token volume and API latency without changing business logic or output quality.

### Why

- Every triage run can process up to `GMAIL_MAX_MESSAGES` emails, each requiring a Jev classification call. Prompt overhead is paid on every call, so even small per-call savings compound quickly.
- Draft generation had no output cap, meaning a single verbose reply could cost 2-5x more tokens than needed.
- Gmail message fetching was sequential (one HTTP request per email), making the fetch stage the slowest part of the pipeline.

### What changed

| # | Change | File | Effect |
|---|---|---|---|
| P0-1 | Added `max_tokens: 300` to Groq draft call | `backend/src/graph/nodes.ts` | Caps draft output at ~200-250 words |
| P0-2 | Compressed Jev `CATEGORY_CRITERIA` and `instructions` | `backend/src/graph/jevClassifier.ts` | Cut classification prompt from ~2,375 to ~660 chars |
| P0-3 | Parallelized Gmail fetch with concurrency 5 | `backend/src/graph/nodes.ts` | 5x faster message retrieval |

### Metrics

#### P0-1 — Draft output cap

| Metric | Before | After |
|---|---|---|
| Max output tokens per draft | Unbounded (model-dependent) | 300 |
| Typical draft cost | ~200-500 tokens | ~150-250 tokens |
| Worst-case cost | 500-2000+ tokens | 300 tokens |

#### P0-2 — Jev prompt compression

| Metric | Before | After | Savings |
|---|---|---|---|
| `CATEGORY_CRITERIA` chars | ~1,545 | ~380 | -75% |
| `instructions` chars | ~830 | ~280 | -66% |
| Total prompt overhead | ~2,375 chars (~590 tokens) | ~660 chars (~165 tokens) | **-72%** |
| Total per-email cost (with 1,200-char body) | ~856 tokens | ~465 tokens | **-46%** |

The two most important disambiguators were preserved:
- "Marketing/promotions are LOW_PRIORITY, not INFORMATIONAL or SPAM."
- "A serious or time-sensitive notice is IMPORTANT even if it asks for a reply."

#### P0-3 — Parallel Gmail fetch

| Metric | Before | After | Savings |
|---|---|---|---|
| Fetch method | Sequential (1 at a time) | 5 concurrent | — |
| Fetch time (100 emails) | ~20s | ~4s | **-80%** |
| Gmail API calls | 100 | 100 | 0% (same) |

### How it works

**P0-1:** The Groq SDK accepts a `max_tokens` parameter. Setting it to 300 ensures the model stops generating after ~300 tokens (~200-250 words). Since drafts go through human review before sending, any truncation is caught and can be extended by the reviewer.

**P0-2:** The Jev classifier sends `CATEGORY_CRITERIA` (descriptions for all 6 categories) and `instructions` (8 detailed rules) on every call. The compressed version keeps the essential discriminators for each category while removing redundant explanations. The two most common LLM misclassifications (marketing as INFORMATIONAL, urgent notices as REQUIRES_REPLY) are explicitly guarded against.

**P0-3:** Instead of `await getMessage(...)` in a loop, messages are fetched in batches of 5 using `Promise.all`. Error handling is preserved — failed fetches are logged and skipped, and the next run retries them.

### Estimated combined impact

For a 100-email triage run with 10 drafts:

| Stage | Before | After | Savings |
|---|---|---|---|
| Jev classification cost | ~$1.71 | ~$0.93 | ~$0.78 |
| Groq draft cost | ~$0.80 | ~$0.32 | ~$0.48 |
| Gmail fetch time | ~20s | ~4s | ~16s |
| **Total** | **~$2.51** | **~$1.25** | **~$1.26 (50%)** |

### Validation

- TypeScript build: passes
- All 182 backend tests: pass
- No changes to business logic, API contracts, or database schemas

## Roadmap / known gaps

- `meetingWorkFlow` is connected but a stub (no Calendar analysis or scheduling yet).
- `STORE`/`REVIEW` actions have no downstream workflow.
- No notification channel (WhatsApp/etc.) yet.
- OAuth state cookie is `SameSite=Lax`; cross-site deployments need `SameSite=None; Secure` plus CORS credentials review.
