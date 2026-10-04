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

## Roadmap / known gaps

- `meetingWorkFlow` is connected but a stub (no Calendar analysis or scheduling yet).
- `STORE`/`REVIEW` actions have no downstream workflow.
- No notification channel (WhatsApp/etc.) yet.
- OAuth state cookie is `SameSite=Lax`; cross-site deployments need `SameSite=None; Secure` plus CORS credentials review.
