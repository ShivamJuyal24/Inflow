# AGENTS.md — Slashy / Inflow

Persistent context for AI coding sessions. Based only on what exists in this repository.

## What this project is

An AI-powered email triage agent (README: **Inflow**; repo/package name: **slashy**). It connects to Gmail via Google OAuth, fetches inbox messages, persists them in Supabase, and classifies them with Groq (Llama 3.3 70B). The long-term goal is conditional routing into reply drafting, calendar workflows, notifications, and human-approved external actions.

**Current reality:** Backend agent pipeline is functional end-to-end via CLI scripts. The Express API handles OAuth only. The React frontend is still the default Vite starter template with no app logic.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, TypeScript, Express 5 |
| Frontend | React 19, Vite 8, Tailwind CSS 4 |
| Database | Supabase (Postgres) via `@supabase/supabase-js` |
| Agent orchestration | LangGraph (`@langchain/langgraph`) |
| Auth | Google OAuth 2.0 (`googleapis`) |
| Email | Gmail API (readonly) |
| LLM | Groq SDK, model `llama-3.3-70b-versatile` |
| Validation | Zod 4 |

Calendar API scopes are requested in OAuth, but no Calendar service or node logic exists yet.

## Architecture

```
React Frontend (stub)
      ↓
Google OAuth → Express API
      ↓
Refresh token → Supabase (google_accounts)
      ↓
LangGraph (CLI: npm run graph)
      ↓
fetch → persist → classify → route → END
```

**Separation of concerns (implemented):**

- `gmail.service.ts` — Gmail API calls (`listMessages`, `getMessage`)
- `email.parser.ts` — Raw Gmail message → app `Email` model
- `graph/nodes.ts` — LangGraph node logic
- `config/` — Google, Supabase, Groq clients
- `controllers/` + `routes/` — HTTP auth endpoints

**LangGraph state** (`graph/state.ts`):

- `emails: Email[]`
- `classification: EmailClassification[]`
- `draft: string | null` (unused)
- `calendarSlots: string[]` (unused)
- `approvalStatus: string | null` (unused)

**Graph flow** (`graph/graph.ts`):

```
START → fetch → persist → classify → route → END
```

`draftNode` and `meetingNode` are registered on the graph but have no edges — they are not executed.

## Folder structure

```
slashy/
├── AGENTS.md
├── README.md                 # Detailed progress log and design docs
├── package.json              # Root monorepo stub (no useful scripts)
├── backend/
│   ├── .env                  # Not committed; required locally
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts         # Express entry
│       ├── config/           # google, googleScopes, supabase, groq
│       ├── controllers/      # auth.controller.ts
│       ├── routes/           # auth.routes.ts
│       ├── graph/            # graph.ts, nodes.ts, state.ts, testGraph.ts
│       ├── services/         # gmail.service.ts, email.parser.ts, testGmail.ts
│       └── types/            # email.ts, classification.ts
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx           # Default Vite template
        └── App.css
```

## Implemented features

### Google OAuth (HTTP)

- `GET /api/auth/google` — redirects to Google consent (`access_type: offline`, `prompt: consent`)
- `GET /api/auth/google/callback` — exchanges code, stores refresh token in Supabase
- `GET /api/auth/google/test-refresh` — tests token refresh (hardcoded to one email)
- `GET /api/health` — health check

**OAuth scopes:** `openid`, `email`, `profile`, `gmail.readonly`, `calendar.readonly`

### Gmail ingestion (LangGraph `fetchNode`)

- Loads first row from `google_accounts` table
- Fetches up to 20 messages with query `in:inbox`
- Parses each message via `email.parser.ts`

### Email persistence (`persistNode`)

- Inserts into Supabase `emails` table
- Deduplicates by `message_id` before insert
- Stores full original body (not the cleaned LLM version)

### AI classification (`classifyNode`)

- Six categories: `SPAM`, `LOW_PRIORITY`, `INFORMATIONAL`, `REQUIRES_REPLY`, `MEETING`, `IMPORTANT`
- Cleans/truncates body (max 5000 chars, strips URLs) before LLM call
- Validates LLM JSON with Zod; `messageId` is set by app code, never by LLM
- Processes emails sequentially with 1s delay between requests
- On Groq 429 rate limit, stops batch early (partial results returned)
- Failed classifications are logged and skipped (no throw)

### Routing (`routeNode`)

- Stub: logs classifications and returns empty partial state

## Supabase schema (inferred from code)

**`google_accounts`:** `email`, `refresh_token`, `created_at`, `updated_at`

**`emails`:** `message_id`, `thread_id`, `account_email`, `from_email`, `to_email`, `subject`, `body`, `received_at`

Backend uses `SUPABASE_SECRET_KEY` (service role) — not the anon key.

## Environment variables

Required in `backend/.env` (no `.env.example` in repo):

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI          # e.g. http://localhost:5000/api/auth/google/callback
SUPABASE_URL
SUPABASE_SECRET_KEY
GROQ_API_KEY
PORT                         # optional, default 5000
```

## Development commands

From `backend/`:

```bash
npm install
npm run dev          # tsx watch src/server.ts → http://localhost:5000
npm run graph        # tsx src/graph/testGraph.ts — run LangGraph pipeline
npm run gmail        # tsx src/services/testGmail.ts — also runs LangGraph (same as graph)
npm run build        # tsc → dist/
npm run start        # node dist/server.js
```

From `frontend/`:

```bash
npm install
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm run preview      # vite preview
```

Root `package.json` has no dev orchestration scripts.

## Testing and build

- **No automated test framework** — no `*.test.*` or `*.spec.*` files
- Root `npm test` exits with error
- Agent pipeline is tested manually via `npm run graph` / `npm run gmail`
- Backend: TypeScript strict mode, compiles to `dist/`
- Frontend: ESLint configured; Tailwind via `@tailwindcss/vite`

## Design decisions (observed in code)

1. **Persist before classify** — emails are stored in Supabase before LLM processing
2. **Gmail logic stays in services** — nodes orchestrate, services talk to APIs
3. **App-level Email model** — Gmail raw payloads are parsed once into a simple type
4. **LLM gets cleaned/truncated body** — full body preserved in DB
5. **messageId integrity** — classification `messageId` always comes from fetched email, not LLM output
6. **Read-only Google scopes** — no send/write permissions yet
7. **Single-user assumption** — `fetchNode` uses `.limit(1).single()` on `google_accounts`
8. **Incremental build** — README documents staged milestones; graph extended node-by-node

## Coding conventions

- **Backend TypeScript:** strict mode, `NodeNext` module resolution, output to `dist/`
- **Imports:** route/controller files use `.js` extensions in import paths (NodeNext pattern)
- **Types:** shared in `backend/src/types/`; Zod schemas co-located with classification types
- **Config:** dotenv loaded in config modules and `server.ts`
- **Naming:** camelCase functions/variables; files like `auth.controller.ts`, `gmail.service.ts`
- **Graph nodes:** exported async functions returning `Partial<EmailTriageState>`
- **Comments:** used for non-obvious logic (email parsing, LLM body cleaning, rate limits)
- **Frontend:** functional React components; default Vite structure

## Current limitations

- **No conditional routing** — all emails go `route → END`; no branching by category
- **`draftNode` / `meetingNode` not wired** — registered but unreachable
- **No HTTP endpoint for graph** — agent runs only via CLI scripts
- **Frontend not integrated** — still Vite starter; no OAuth UI or email display
- **Classification not persisted to Supabase** — only in LangGraph state at runtime
- **No Calendar integration** despite readonly scope
- **No reply drafting, notifications, or approval UI**
- **No email sending** (readonly Gmail scope)
- **Hardcoded test email** in `testGoogleRefresh` (`shivamjuyal.dev@gmail.com`)
- **Gmail query mismatch** — README mentions `is:unread in:inbox`; code uses `in:inbox` only
- **Duplicate body-cleaning logic** — `cleanEmailBody` in `nodes.ts` (5000 char limit) vs `cleanBodyForClassification` in `email.parser.ts` (2000 char limit, unused by classify node)
- **Missing frontend files** — `main.tsx` imports `./index.css` and `App.tsx` references asset files not present in repo
- **No `.env.example`** — env vars must be inferred from config files

## Planned next steps (from README, not implemented)

- Conditional routing in `routeNode` by classification category
- Persist classifications to Supabase
- Reply drafting, meeting/calendar workflow, notifications, human approval UI

Refer to `README.md` for the full progress log, category definitions, and design principles.
