# AGENTS.md — Slashy / Inflow

Persistent context for coding sessions. This document is based only on the current repository.

## Project state

Inflow (`slashy`) is a single-user Gmail triage application. Google OAuth provides a stored refresh token; the LangGraph pipeline fetches inbox emails, persists them in Supabase, classifies them with Groq, derives actions, persists new action records, conditionally routes selected actions, and generates reply drafts for `DRAFT_REPLY` actions.

The Express server provides health, OAuth, and draft-review/send routes. The graph runs from backend CLI scripts; there is no graph HTTP endpoint. `frontend/` provides a draft approval screen backed by the draft API.

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, TypeScript, Express 5 |
| Frontend | React 19, Vite 8, Tailwind CSS 4 |
| Database | Supabase Postgres via `@supabase/supabase-js` |
| Orchestration | LangGraph |
| OAuth and email | Google OAuth 2.0 and Gmail API via `googleapis` |
| LLM | Groq SDK, `llama-3.3-70b-versatile` |
| Validation | Zod 4 |

Google OAuth requests `openid`, `email`, `profile`, `gmail.readonly`, `gmail.send`, and `calendar.readonly`. Gmail sending is limited to explicitly approved reply drafts; there is no Calendar implementation.

## Repository layout

```text
slashy/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── package.json              # root stub; no useful scripts
├── backend/
│   ├── .env                  # not committed; required locally
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts
│       ├── config/           # google, googleScopes, supabase, groq
│       ├── controllers/      # auth.controller.ts
│       ├── routes/           # auth.routes.ts
│       ├── graph/
│       │   ├── graph.ts
│       │   ├── nodes.ts
│       │   ├── state.ts
│       │   ├── actionMapper.ts
│       │   ├── testGraph.ts
│       │   ├── testRouting.ts
│       │   └── testDraft.ts
│       ├── services/
│       │   ├── gmail.service.ts
│       │   ├── email.parser.ts
│       │   └── testGmail.ts
│       └── types/
│           ├── email.ts
│           ├── classification.ts
│           ├── action.ts
│           └── draft.ts
└── frontend/                 # default Vite starter; not wired to backend
```

## Current architecture

```text
Google OAuth → Express API → Supabase (google_accounts)
                                   ↓
                            LangGraph CLI
                                   ↓
fetch → persist emails → classify → map actions → persist actions → route
                                   ↓
              END / draftWorkFlow (reply drafts) / meetingWorkFlow (stub)
```

### LangGraph flow

`backend/src/graph/graph.ts` defines:

```text
START → fetch → persist → classify → action
action → END | draftWorkFlow | meetingWorkFlow
draftWorkFlow → END
meetingWorkFlow → END
```

- `actionNode` maps classifications to actions via `actionMapper.ts` and persists new rows to `email_actions`.
- `routeActions` is the conditional router attached after `action`.
- `draftNode` (`draftWorkFlow`) generates Groq reply drafts, persists them to `drafts`, and marks `DRAFT_REPLY` actions `COMPLETED`.
- `meetingNode` (`meetingWorkFlow`) is connected but remains a stub: it logs and returns an empty partial state.

There is no `routeNode`; routing is handled by the `routeActions` function.

### Graph state

`EmailTriageState` contains:

- `emails: Email[]`
- `classification: EmailClassification[]`
- `actions: EmailAction[]`
- `drafts: EmailDraft[]`
- `calendarSlots: string[]`
- `approvalStatus: string | null`

`calendarSlots` and `approvalStatus` are currently unused by implemented node logic.

State reducers replace arrays entirely (`(_, next) => next`), not append.

## Pipeline responsibilities and design decisions

- Gmail API access stays in `services/gmail.service.ts`; message parsing stays in `services/email.parser.ts`; classification-to-action mapping stays in `graph/actionMapper.ts`; graph orchestration stays in `graph/`; shared contracts stay in `types/`.
- `fetchNode` reads the first `google_accounts` row (`.limit(1).single()`), which is a single-account assumption. It fetches up to 10 messages matching `in:inbox`, fetches their full payloads, and parses them into the application `Email` model. (The inline comment in `nodes.ts` still says "20 recent unread" — the code passes `10` and the query is `in:inbox`, not `is:unread`.)
- The parser prefers plain-text MIME parts, falls back to stripped HTML, and produces ISO timestamps. Parsed full bodies are retained. `email.parser.ts` also exports `cleanBodyForClassification` (2000-char cap); `classifyNode` uses its own `cleanEmailBody` helper (5000-char cap) instead.
- `persistNode` runs before classification. It reads existing `emails.message_id` values and inserts only unseen emails. `account_email` is set to `email.to` (the recipient header), not the connected Google account email from `google_accounts`.
- `classifyNode` classifies every email in `state.emails` for the current run; it does not skip emails that were classified in a prior run. Classifications are not persisted to Supabase.
- `classifyNode` uses Groq with `llama-3.3-70b-versatile`, temperature 0, JSON-object output, and Zod validation. It removes URLs/extra whitespace and limits LLM input to 5,000 body characters; the stored body is not truncated.
- Classification is sequential with a one-second delay. Individual failures are logged and skipped; a Groq 429 stops the remainder of the batch and returns partial classifications.
- The application owns classification `messageId`: the LLM must not provide it, and the node attaches the Gmail ID only after validating model-generated fields.

## Classification and action lifecycle

Classification categories are `SPAM`, `LOW_PRIORITY`, `INFORMATIONAL`, `REQUIRES_REPLY`, `MEETING`, and `IMPORTANT`.

`graph/actionMapper.ts` maps them as follows:

| Classification | Action type | Initial status |
|---|---|---|
| `SPAM`, `LOW_PRIORITY`, `INFORMATIONAL` | `STORE` | `COMPLETED` |
| `IMPORTANT` | `REVIEW` | `PENDING` |
| `REQUIRES_REPLY` | `DRAFT_REPLY` | `PENDING` |
| `MEETING` | `ANALYZE_MEETING` | `PENDING` |

The complete action status vocabulary is `PENDING`, `COMPLETED`, and `FAILED`. `STORE` is `COMPLETED` because the email has already been persisted by `persistNode`; the action node does not itself transition existing actions.

Action types are defined in `types/action.ts` as `STORE`, `REVIEW`, `DRAFT_REPLY`, and `ANALYZE_MEETING`.

### `email_actions` persistence and idempotency

`actionNode` derives one action per classification, then queries `email_actions` for existing `(message_id, action_type)` pairs. It inserts only newly derived pairs and also de-duplicates identical pairs within the same invocation.

This makes action creation idempotent on `(message_id, action_type)`. Existing rows are skipped rather than updated. If checking or inserting actions fails, the node throws.

### Routing

`routeActions` examines `state.actions` after the action node:

- Any `DRAFT_REPLY` action routes to `draftWorkFlow`.
- Any `ANALYZE_MEETING` action routes to `meetingWorkFlow`.
- A batch containing both types routes to both destinations.
- If neither type appears, routing returns `END`.
- `STORE` and `REVIEW` have no downstream workflow yet.

### Reply draft workflow (`draftNode`)

When routed to `draftWorkFlow`, `draftNode`:

1. Filters `state.actions` for `DRAFT_REPLY`.
2. Looks up Supabase `emails.id` (UUID) for each Gmail `message_id`.
3. Skips emails that already have a row in `drafts` (by `email_id`); those are treated as already completed.
4. For remaining actions, finds the matching email in `state.emails`. If the email body is not in state, logs a warning and skips (draft generation requires the email content in graph state).
5. Calls Groq (`llama-3.3-70b-versatile`, temperature 0.3) with up to 8,000 characters of the original body. No JSON response format; free-text reply body.
6. Builds `EmailDraft` objects with status `PENDING_REVIEW`.
7. Upserts new drafts into `drafts` on `email_id` (`ignoreDuplicates: true`; relies on a unique constraint on `drafts.email_id`).
8. Updates matching `email_actions` rows (`action_type = DRAFT_REPLY`) to `COMPLETED` in Supabase and in returned state.

Draft status vocabulary (`types/draft.ts`): `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `SENT`. Only `PENDING_REVIEW` is written by the current node.

Individual draft failures are logged and skipped; a Groq 429 stops the remainder of the batch. Sequential processing uses the same one-second delay as classification.

## Supabase tables used

Table details are inferred from repository queries:

| Table | Fields used / purpose |
|---|---|
| `google_accounts` | `email`, `refresh_token`, `created_at`, `updated_at`; stores OAuth accounts. |
| `emails` | `id` (UUID PK), `message_id`, `thread_id`, `account_email`, `from_email`, `to_email`, `subject`, `body`, `received_at`, `category`, `classification_reason`, `suggested_action`, `classified_at`; stores fetched messages and persisted classifications. |
| `email_actions` | `message_id`, `action_type`, `status`; stores durable derived actions. |
| `drafts` | `email_id` (FK to `emails.id`, unique), `body`, `status`; stores generated reply drafts. |

The backend uses `SUPABASE_SECRET_KEY` for server-side Supabase operations. Do not expose it to the frontend or commit credentials. Refresh tokens are stored in plaintext.

## HTTP endpoints and environment

Implemented endpoints:

- `GET /api/health`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/google/test-refresh` — uses a hard-coded development email (`shivamjuyal.dev@gmail.com`).
- `GET /api/drafts`
- `GET /api/drafts/:emailId`
- `POST /api/drafts/:emailId/approve`
- `POST /api/drafts/:emailId/reject`
- `POST /api/drafts/:emailId/send`

`backend/.env` requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `GROQ_API_KEY`; `PORT` is optional and defaults to 5000. There is no committed `.env.example`.

## Development and verification

From `backend/`:

```bash
npm run dev       # Express on http://localhost:5000
npm run build     # tsc → dist/
npm run start     # node dist/server.js
npm run graph     # tsx src/graph/testGraph.ts
npm run gmail     # tsx src/services/testGmail.ts — full live pipeline
npm run draft     # tsx src/graph/testDraft.ts — draftNode in isolation
```

Manual scripts without package scripts:

- `graph/testRouting.ts` — calls `routeActions` directly with fixture actions.

Script behavior:

- `testGmail.ts` invokes the full compiled graph with empty initial state against live Gmail/Supabase/Groq.
- `testGraph.ts` invokes the full compiled graph but pre-seeds `classification` and `actions`; because reducers replace arrays, those pre-seeded values are overwritten once `fetch`, `classify`, and `action` run on live data.
- `testDraft.ts` loads one persisted email from Supabase and calls `draftNode` directly with synthetic classification/action state.

There is no automated test framework or committed `*.test.*`/`*.spec.*` suite. Running the graph/Gmail/draft scripts requires configured credentials and live Supabase/Groq access, and can write email, action, and draft data to Supabase.

Root `package.json` has no dev orchestration scripts. Frontend `npm run dev` may fail: `main.tsx` imports `./index.css`, which is not present in the repository; `App.tsx` references asset files that are also absent.

## Conventions to preserve

- Use strict TypeScript with `NodeNext` module resolution and output to `backend/dist`.
- Keep integrations, parsing, orchestration, and shared contracts separated as described above.
- Export graph nodes as async functions returning `Partial<EmailTriageState>`.
- Validate LLM-owned fields with Zod and keep application-owned IDs outside LLM control.
- Preserve persist-before-classify sequencing and action idempotency by `(message_id, action_type)`.
- Preserve draft idempotency by `drafts.email_id` and existing-draft skip logic in `draftNode`.
- Preserve the approval gate: only `APPROVED` drafts may be sent through Gmail.
- Keep route/controller import extensions consistent with existing NodeNext `.js` imports.
- Do not modify `.env` or commit secrets.

## Current limitations

- The draft workflow supports `PENDING_REVIEW → APPROVED → SENT` and `PENDING_REVIEW → REJECTED`. The frontend exposes review, approval, rejection, and sending; the backend rejects sends unless the draft is `APPROVED`.
- `meetingWorkFlow` does not analyze meetings, read Calendar, find slots, or create Calendar events.
- No notification, WhatsApp, or Calendar workflow exists.
- `STORE` and `REVIEW` do not have downstream handling.
- Classifications are persisted on `emails` and already-classified emails are skipped on later graph runs.
- `draftNode` requires the email body in `state.emails`; it does not re-fetch from Supabase if missing from state.
- Duplicate body-cleaning logic exists in `nodes.ts` and `email.parser.ts`.
- The frontend is currently limited to the draft approval screen, and the graph has no HTTP endpoint.
- OAuth lacks CSRF `state` parameter; CORS is fully open; refresh tokens are not encrypted at rest.
- No committed database migration files; schema exists only in Supabase.
