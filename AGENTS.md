# AGENTS.md — Slashy / Inflow

Persistent context for coding sessions. This document is based only on the current repository.

## Project state

Inflow (`slashy`) is a single-user, read-only Gmail triage backend. Google OAuth provides a stored refresh token; the LangGraph pipeline fetches inbox emails, persists them in Supabase, classifies them with Groq, derives actions, persists new action records, and conditionally routes selected actions to placeholder workflows.

The Express server provides health and OAuth routes only. The graph runs from backend CLI scripts; there is no graph HTTP endpoint. `frontend/` remains an unintegrated Vite starter.

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

Google OAuth requests `openid`, `email`, `profile`, `gmail.readonly`, and `calendar.readonly`. There is no Gmail write scope and no Calendar implementation.

## Current architecture

```text
Google OAuth → Express API → Supabase (google_accounts)
                                   ↓
                            LangGraph CLI
                                   ↓
fetch → persist emails → classify → map actions → persist actions → route
                                   ↓
                     END / draftWorkFlow stub / meetingWorkFlow stub
```

### LangGraph flow

`backend/src/graph/graph.ts` defines:

```text
START → fetch → persist → classify → action
action → END | draftWorkFlow | meetingWorkFlow
draftWorkFlow → END
meetingWorkFlow → END
```

- `actionNode` performs action mapping and durable action persistence.
- `routeActions` is the conditional router attached after `action`.
- `draftNode` and `meetingNode` are connected and can execute, but only log and return an empty partial state.

### Graph state

`EmailTriageState` contains:

- `emails: Email[]`
- `classification: EmailClassification[]`
- `actions: EmailAction[]`
- `draft: string | null`
- `calendarSlots: string[]`
- `approvalStatus: string | null`

`draft`, `calendarSlots`, and `approvalStatus` are currently unused by implemented node logic.

## Pipeline responsibilities and design decisions

- Gmail API access stays in `services/gmail.service.ts`; message parsing stays in `services/email.parser.ts`; graph orchestration stays in `graph/`; shared contracts stay in `types/`.
- `fetchNode` reads the first `google_accounts` row (`.limit(1).single()`), which is a single-account assumption. It fetches up to 10 messages matching `in:inbox`, fetches their full payloads, and parses them into the application `Email` model.
- The parser prefers plain-text MIME parts, falls back to stripped HTML, and produces ISO timestamps. Parsed full bodies are retained.
- `persistNode` runs before classification. It reads existing `emails.message_id` values and inserts only unseen emails.
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

## Supabase tables used

Table details are inferred from repository queries:

| Table | Fields used / purpose |
|---|---|
| `google_accounts` | `email`, `refresh_token`, `created_at`, `updated_at`; stores OAuth accounts. |
| `emails` | `message_id`, `thread_id`, `account_email`, `from_email`, `to_email`, `subject`, `body`, `received_at`; stores fetched messages. |
| `email_actions` | `message_id`, `action_type`, `status`; stores durable derived actions. |

The backend uses `SUPABASE_SECRET_KEY` for server-side Supabase operations. Do not expose it to the frontend or commit credentials.

## HTTP endpoints and environment

Implemented endpoints:

- `GET /api/health`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/google/test-refresh` — uses a hard-coded development email.

`backend/.env` requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `GROQ_API_KEY`; `PORT` is optional and defaults to 5000.

## Development and verification

From `backend/`:

```bash
npm run dev
npm run build
npm run graph
npm run gmail
```

There is no automated test framework or committed `*.test.*`/`*.spec.*` suite. `graph/testGraph.ts` and `graph/testRouting.ts` are manual scripts; `testRouting.ts` has no package script. Running the graph/Gmail scripts requires configured credentials and live Supabase/Groq access, and can write email/action data to Supabase.

## Conventions to preserve

- Use strict TypeScript with `NodeNext` module resolution and output to `backend/dist`.
- Keep integrations, parsing, orchestration, and shared contracts separated as described above.
- Export graph nodes as async functions returning `Partial<EmailTriageState>`.
- Validate LLM-owned fields with Zod and keep application-owned IDs outside LLM control.
- Preserve persist-before-classify sequencing and action idempotency by `(message_id, action_type)`.
- Preserve read-only Gmail behavior unless a task explicitly introduces new scopes and a safe execution design.
- Keep route/controller import extensions consistent with existing NodeNext `.js` imports.
- Do not modify `.env` or commit secrets.

## Current limitations

- `draftWorkFlow` does not generate or send replies.
- `meetingWorkFlow` does not analyze meetings, read Calendar, find slots, or create Calendar events.
- No notification, WhatsApp, approval, or external-action workflow exists.
- No Gmail sending or other Gmail write operation exists.
- `STORE` and `REVIEW` do not have downstream handling.
- Classifications are held in graph state only; there is no classification table persistence.
- The frontend has no application integration, and the graph has no HTTP endpoint.