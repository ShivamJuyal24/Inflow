# Inflow — Email Triage Agent [In- Progress]

An AI-powered email assistant that connects to Gmail and Calendar to triage emails, identify what matters, draft replies, detect meetings, and eventually take approved actions on the user's behalf.

The goal is to build a scoped, single-user version of an agentic email workflow — starting with reliable Gmail ingestion and gradually adding classification, drafting, calendar actions, notifications, and human approval.

---

## Stack

- **Backend:** Node.js + TypeScript + Express
- **Frontend:** React + Tailwind
- **Database:** Supabase (Postgres)
- **Agent orchestration:** LangGraph (`@langchain/langgraph`)
- **Authentication:** Google OAuth 2.0
- **Email:** Gmail API
- **Calendar:** Google Calendar API
- **LLM:** Groq
- **Model:** `openai/gpt-oss-120b`
- **Notifications (planned):** WhatsApp or similar notification channel

---

## Goal

The agent is designed to save time by automatically understanding incoming emails and deciding what should happen next.

```text
New Email
    ↓
Fetch
    ↓
Persist
    ↓
Classify
    ↓
Route
    ↓
┌──────────────┬────────────────┬──────────────┬─────────────────┐
↓              ↓                ↓              ↓
Spam         Important        Meeting       Informational
↓              ↓                ↓              ↓
Ignore       Draft Reply     Calendar       Notify /
             / Review        Workflow       No Action
```

The agent should eventually be able to:

- Ignore obvious spam
- Identify important emails
- Identify emails that don't require a response
- Draft replies
- Detect meeting requests
- Find suitable calendar slots
- Prepare calendar actions
- Notify the user through WhatsApp or another channel
- Ask for human approval before sending emails or taking external actions

---

## Architecture

The application uses LangGraph to control the agent's workflow.

```text
React Frontend
      ↓
Google OAuth
      ↓
Express Backend
      ↓
Google Authorization
      ↓
Access Token + Refresh Token
      ↓
Supabase
      ↓
LangGraph
      ↓
fetch → persist → classify → action → route
      ↓
draft / calendar / notification / etc.
      ↓
Human Approval
      ↓
External Action
```

The important design decision is that Gmail integration, persistence, email parsing, and agent logic are kept separate.

```text
gmail.service.ts
        ↓
Talks to Gmail API


email.parser.ts
        ↓
Converts Gmail response into application Email model


fetchNode
        ↓
Fetches real Gmail messages


persistNode
        ↓
Stores emails in Supabase and prevents duplicates


classifyNode
        ↓
Uses Groq to classify emails


actionNode
        ↓
Maps classifications to durable actions and persists them


routeActions
        ↓
Decides which workflow should happen next
```

---

## Current Project Structure

```text
project/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── google.ts
│   │   │   ├── googleScopes.ts
│   │   │   ├── supabase.ts
│   │   │   └── groq.ts
│   │   │
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   └── draft.controller.ts
│   │   │
│   │   ├── graph/
│   │   │   ├── graph.ts
│   │   │   ├── nodes.ts
│   │   │   ├── state.ts
│   │   │   ├── actionMapper.ts
│   │   │   ├── testGraph.ts
│   │   │   ├── testRouting.ts
│   │   │   └── testDraft.ts
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   └── draft.routes.ts
│   │   │
│   │   ├── services/
│   │   │   ├── gmail.service.ts
│   │   │   ├── email.parser.ts
│   │   │   └── testGmail.ts
│   │   │
│   │   ├── types/
│   │   │   ├── email.ts
│   │   │   ├── classification.ts
│   │   │   ├── action.ts
│   │   │   └── draft.ts
│   │   │
│   │   └── server.ts
│   │
│   └── .env
│
└── frontend/
```

The newer workflow files keep each responsibility separate:

- `actionMapper.ts` converts classifications into application action types.
- `action.ts` and `draft.ts` define the shared action and draft contracts.
- `draft.controller.ts` handles listing, reviewing, approving, rejecting, and sending reply drafts.
- `draft.routes.ts` exposes the draft API routes used by the frontend.
- `testRouting.ts` and `testDraft.ts` allow the routing and draft workflow to be checked independently.

**Frontend**

The React frontend now provides a responsive draft-review workspace:

- `App.tsx` manages draft loading, selection, refresh, feedback, and draft actions.
- `components/DraftCard.tsx` renders a draft summary, status, and quick review actions.
- `components/DraftDetail.tsx` displays the original email and proposed reply in a detail pane.
- `lib/draftApi.ts` keeps calls to the draft API in one typed client.
- `types/draft.ts` defines the frontend draft and email contracts.

Vite proxies `/api` requests to the backend during local development. `VITE_API_URL` can override that base path when needed.

---

## Progress Log

### Day 1 — Project Setup + Google Cloud OAuth ✅

**Backend**
- Node.js + TypeScript + Express configured
- `tsx` used for development
- Backend structure created
- `.env` kept inside `backend/` and outside `src/`
- Backend running on `http://localhost:5000`

**Frontend**
- React + Tailwind configured
- Monorepo-style structure created (`backend/` + `frontend/`)

**Supabase**
- Supabase project created
- Supabase client configured
- `google_accounts` table created with:
  - `id`
  - `email`
  - `refresh_token`
  - `created_at`
  - `updated_at`

**Google Cloud**
- Google Cloud project created
- Gmail API enabled
- Google Calendar API enabled
- OAuth consent screen configured
- Test user added
- OAuth Client ID + Secret created
- Redirect URI configured: `http://localhost:5000/api/auth/google/callback`

**GitHub**
- Project pushed to GitHub
- `.env` excluded from Git

---

### Day 2 — Google OAuth End-to-End ✅

**Google Login**

Implemented: `GET /api/auth/google`

The OAuth flow uses:
- `access_type: "offline"`
- `prompt: "consent"`

This allows the application to receive a refresh token.

**OAuth Scopes**

Currently requested:
- `openid`
- `email`
- `profile`
- `gmail.readonly`
- `calendar.readonly`

This gives the backend permission to:
- Identify the Google account
- Read Gmail
- Read Google Calendar

**OAuth Callback**

Implemented: `GET /api/auth/google/callback`

The callback:
1. Receives the authorization code
2. Exchanges it for Google tokens
3. Receives an access token and refresh token
4. Retrieves the user's Google email
5. Stores the refresh token in Supabase

**Supabase**

Initially encountered an RLS error:

```text
new row violates row-level security policy
```

This was fixed by using the Supabase service-role/secret key for backend database operations. The secret remains backend-only and is never exposed to React or committed to GitHub.

**Refresh Token Testing**

Implemented and tested: `GET /api/auth/google/test-refresh`

This:
1. Retrieves the refresh token from Supabase
2. Requests a new access token from Google OAuth
3. Confirms the refresh succeeds

**Verified**

| Item | Status |
|---|---|
| Google OAuth | ✅ |
| Authorization code | ✅ |
| Access token | ✅ |
| Refresh token | ✅ |
| Google email | ✅ |
| Supabase storage | ✅ |
| Token refresh | ✅ |

---

### Day 3 — LangGraph Setup + Graph Skeleton ✅

**Goal**

Set up LangGraph and make sure the agent workflow runs from beginning to end before adding real application logic.

**Completed**
- Installed `@langchain/langgraph`
- Created shared agent state in `state.ts`
- Created graph nodes: `fetch`, `persist`, `classify`, `route`
- Created `StateGraph`
- Connected nodes from `START` to `END`
- Created `testGraph.ts`
- Confirmed the graph executes successfully

Initial graph:

```text
START
  ↓
fetch
  ↓
classify
  ↓
route
  ↓
END
```

The graph was tested before introducing real Gmail and AI logic. This made it easier to isolate problems later.

---

### Day 4 — Real Gmail Data + Fetch Node ✅

This was the first major real-world milestone. The fetch node was changed from returning dummy data to fetching actual emails from Gmail.

**Gmail Service**

Created a Gmail service responsible for communicating with the Gmail API. It provides:
- `listMessages()`
- `getMessage()`

The service uses the stored Google refresh token to authenticate with Gmail. The application currently requests up to **10 inbox emails** using the Gmail query `in:inbox`.

**Email Model**

Gmail returns a large and complicated message object. The parser converts it into our own application-level `Email` object:

```ts
export type Email = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
};
```

Instead of passing Gmail's entire raw response through the agent, the application converts it into this simpler structure.

**Fetch Node**

`fetchNode` now:
1. Retrieves the Google account from Supabase
2. Gets the stored refresh token
3. Requests recent Gmail messages
4. Retrieves each full message
5. Parses each message
6. Places the resulting emails into LangGraph state

Flow:

```text
Supabase
   ↓
Refresh Token
   ↓
Gmail API
   ↓
Message IDs
   ↓
Full Gmail Messages
   ↓
Email Parser
   ↓
Email[]
   ↓
LangGraph State
```

**Verified**

The application successfully fetched and parsed 20 real Gmail emails.

Example terminal output:

```text
Messages found: 20
Parsed 20 emails
```

---

### Day 5 — Supabase Email Persistence + Deduplication ✅

This milestone introduced durable storage for emails fetched from Gmail.

Before this step:

```text
Gmail
  ↓
fetchNode
  ↓
LangGraph State
```

If the application stopped, the fetched emails only existed temporarily. Now:

```text
Gmail
  ↓
fetchNode
  ↓
LangGraph State
  ↓
persistNode
  ↓
Supabase
  ↓
emails table
```

**Emails Table**

Created an `emails` table containing:
- `message_id`
- `thread_id`
- `account_email`
- `from_email`
- `to_email`
- `subject`
- `body`
- `received_at`

`message_id` is used as the unique identifier for a Gmail message. This allows the application to determine whether an email has already been processed.

**Persist Node**

Created `persistNode`. The node:
1. Receives emails from LangGraph state
2. Extracts Gmail message IDs
3. Checks which messages already exist
4. Filters out existing emails
5. Inserts only new emails into Supabase

Flow:

```text
state.emails
      ↓
persistNode
      ↓
Check message IDs
      ↓
Find existing emails
      ↓
Keep only new emails
      ↓
Insert
      ↓
Supabase
```

**Duplicate Detection**

For example:

```text
Gmail:    A B C D E
Supabase: A B C
New:      D E
```

Only D and E are persisted. This prevents repeated graph executions from creating duplicate records.

**Verified**

A later run showed:

```text
Found 17 existing emails
New emails to persist: 3
```

This confirmed that deduplication works correctly across multiple runs.

**Timestamp Handling**

Gmail's `Date` header initially produced values such as:

```text
Wed, 12 Aug 2026 17:08:29 +0530 (IST)
```

Postgres rejected this format for the timestamp column. The parser was updated to normalize Gmail timestamps into ISO format before persistence.

---

### Day 6 — AI Email Classification with Groq ✅

This is the first major AI milestone. The goal was to replace the placeholder classifier with a real LLM-powered classification system.

The workflow is now:

```text
Real Gmail Email
      ↓
Email Parser
      ↓
Clean + Truncate Body
      ↓
Groq LLM
      ↓
Structured JSON
      ↓
Zod Validation
      ↓
Email Classification
      ↓
LangGraph State
```

**Classification Categories**

The classifier supports exactly six categories:
- `SPAM`
- `LOW_PRIORITY`
- `INFORMATIONAL`
- `REQUIRES_REPLY`
- `MEETING`
- `IMPORTANT`

**Category Definitions**

- **SPAM** — Clearly unwanted, deceptive, suspicious, or irrelevant email.
- **LOW_PRIORITY** — Legitimate email that does not require attention or action.
- **INFORMATIONAL** — Useful information or notification that does not require a response.
- **REQUIRES_REPLY** — The sender explicitly expects or asks for a response.
- **MEETING** — The email involves a meeting, interview, appointment, scheduling, calendar invitation, or finding a time to meet.
- **IMPORTANT** — The email requires significant attention but does not fit better into another category.

**Structured Classification Contract**

The classifier is required to return JSON matching:

```json
{
  "category": "INFORMATIONAL",
  "reason": "Short explanation of why this category was chosen.",
  "suggested_action": "What the email agent should do next."
}
```

The model returns only the classification fields. The application attaches the Gmail `messageId` after validation, so the model cannot control the email-to-classification mapping.

**Zod Schema**

The classification contract is represented using:
- `EmailCategorySchema`
- `EmailClassificationSchema`

This prevents invalid categories or malformed AI responses from entering the application state.

**Groq Integration**

The classifier uses `openai/gpt-oss-120b` with `temperature: 0`.

The Groq request also uses:

```json
{
  "response_format": {
    "type": "json_object"
  }
}
```

This forces the model toward structured JSON output instead of free-form text.

**Email Body Cleaning**

A major issue discovered during testing was that real-world emails can contain extremely large bodies. Some job emails were more than **80,000 characters**. Sending these directly to the LLM caused Groq token-limit errors.

The classifier now cleans and limits the body before sending it to Groq.

Cleaning includes:
- Removing URLs
- Removing excessive whitespace
- Removing unnecessary blank lines
- Truncating long bodies

The cleaned body is used only for classification. The original email body is still preserved in Supabase.

```text
Original Email
      ↓
Stored completely


Cleaned Email
      ↓
Sent to LLM
```

**Verified**

Example test output:

```text
Original body length: 82661
Classification body length: 5043
```

Another large email:

```text
Original body length: 82705
Classification body length: 5043
```

This significantly reduced the LLM input size.

**Groq Token Limit Issue**

During the first 20-email classification test, Groq returned:

```text
413 Request too large
```

because the combined token usage exceeded the available TPM limit.

The application was then improved by:
- Cleaning email bodies
- Truncating large bodies
- Processing emails individually
- Adding a delay between classification requests

This made the classification workload much more predictable.

**Classification Prompt**

The classifier prompt includes explicit decision rules. Important rules include:

1. Choose exactly ONE category.
2. Clearly suspicious emails → `SPAM`.
3. Scheduling, interviews, appointments, or meetings → `MEETING`.
4. Explicit request for a response → `REQUIRES_REPLY`, unless it is primarily a meeting/scheduling request.
5. Do not classify something as `IMPORTANT` merely because it is from a professional sender.
6. Useful information without required action → `INFORMATIONAL`.
7. Legitimate email that can safely be ignored → `LOW_PRIORITY`.
8. Job alerts, newsletters, promotional emails, and general notifications should usually be `INFORMATIONAL` or `LOW_PRIORITY` unless they explicitly require action.
9. Do not assume every job opportunity requires a reply.

The prompt was tuned after testing it against real Gmail data.

**Classification Testing**

The classifier was tested against approximately 20 real Gmail emails.

The first test revealed an important issue:

```text
20 / 20 → INFORMATIONAL
```

This was investigated instead of assuming the classifier was correct. The prompt was refined and the classifier was tested again with a more varied set of emails.

The second test produced meaningful category diversity. Examples included:
- `REQUIRES_REPLY` — for emails asking the recipient to confirm attendance or respond.
- `IMPORTANT` — for emails containing urgent requests.
- `MEETING` — for emails involving scheduling calls and interviews.
- `INFORMATIONAL` — for normal job alerts, newsletters, and notifications.

This confirmed that the classifier is not simply defaulting to `INFORMATIONAL`.

**Message ID Integrity**

An earlier classification run exposed a data-integrity bug. One classification result incorrectly contained:

```text
messageId: "shivamjuyal.dev@gmail.com"
```

instead of a Gmail message ID. This was investigated and fixed. The classifier now verifies that the classification result corresponds to the email currently being processed.

Verified output now contains real Gmail message IDs such as:

```text
19ff9e88d29a57e5
19ff9d61de1302ba
19ff9a7da3f881c8
```

The corrupted account-email value is no longer being used as a message ID. This is important because future routing and Supabase classification persistence will depend on reliable message-to-classification mapping.

**Current Graph**

The graph now runs as:

```text
START
  ↓
fetchNode
  ↓
persistNode
  ↓
classifyNode
  ↓
actionNode (map classifications and persist actions)
  ↓
routeActions
  ↓
END / draftWorkFlow / meetingWorkFlow
```

`actionNode` performs the action-mapping and action-persistence stages. `routeActions` conditionally sends `DRAFT_REPLY` actions to `draftWorkFlow` and `ANALYZE_MEETING` actions to `meetingWorkFlow`; batches with both action types can reach both placeholder nodes. `STORE` and `REVIEW` actions currently route to `END`.

`draftWorkFlow` generates and persists reply drafts with status `PENDING_REVIEW`. `meetingWorkFlow` remains a placeholder; it does not yet analyze meetings, access Calendar, or take an external action.
**Current Classification State**

After classification, LangGraph state contains structured results similar to:

```json
[
  {
    "messageId": "19ff9e88d29a57e5",
    "category": "INFORMATIONAL",
    "reason": "The email provides a job opportunity notification but does not explicitly require a response.",
    "suggested_action": "No action required, the user can review the opportunity at their convenience."
  },
  {
    "messageId": "19ff7b1f67613b4d",
    "category": "MEETING",
    "reason": "The email involves scheduling a meeting.",
    "suggested_action": "Check calendar availability and prepare a response."
  }
]
```

The classification array is currently written into LangGraph state.

---

## Current Status

| Component | Status |
|---|---|
| Google OAuth | ✅ |
| Supabase | ✅ |
| Refresh token storage | ✅ |
| Refresh token testing | ✅ |
| LangGraph setup | ✅ |
| Gmail API integration and message parsing | ✅ |
| Fetch up to 10 inbox emails | ✅ |
| Supabase email persistence and deduplication | ✅ |
| Timestamp normalization | ✅ |
| Groq integration | ✅ |
| Structured JSON classification and Zod validation | ✅ |
| Six-category classification | ✅ |
| Classification message ID integrity | ✅ |
| Classification-to-action mapping | ✅ |
| Durable `email_actions` persistence | ✅ |
| Action idempotency by `(message_id, action_type)` | ✅ |
| Conditional action routing | ✅ |
| Reply generation | ✅ |
| Meeting analysis and Calendar workflow | ⏳ |
| WhatsApp notifications | ⏳ |
| Human approval UI/workflow | ✅ |
| Sending emails | ✅ |
| Classification persistence to Supabase | ✅ |
| Automatic Gmail sync | ✅ |
| Email listing, detail, and manual sync API | ✅ |
| Responsive draft review frontend | ✅ |
## Day 6 Result

Day 6 successfully established the core AI classification pipeline:

```text
Gmail
  ↓
Fetch real emails
  ↓
Parse
  ↓
Clean body
  ↓
Limit LLM input
  ↓
Groq
  ↓
Structured JSON
  ↓
Zod validation
  ↓
LangGraph state
```

The classifier has been tested on real emails and successfully distinguishes between different types of email instead of always returning the same category.

The major engineering problems encountered during this milestone were:
- Excessively large email bodies
- Groq token limits
- JSON output validation
- Classification prompt quality
- Message ID integrity
- Duplicate email persistence

These have been addressed sufficiently for the next stage.

---

## Day 7 — Action Mapping, Persistence, and Conditional Routing ✅

Day 7 turns a classification into a durable, routable action record.

```text
classification
      ↓
action mapping
      ↓
persist `email_actions`
      ↓
conditional routing
```

### Action mapping

Each classification maps to one action type:

| Classification | Action type |
|---|---|
| `SPAM`, `LOW_PRIORITY`, `INFORMATIONAL` | `STORE` |
| `IMPORTANT` | `REVIEW` |
| `REQUIRES_REPLY` | `DRAFT_REPLY` |
| `MEETING` | `ANALYZE_MEETING` |

The supported action types are `STORE`, `REVIEW`, `DRAFT_REPLY`, and `ANALYZE_MEETING`.

### Durable action persistence

`actionNode` maps classifications and stores new action records in the Supabase `email_actions` table. The fields written by the backend are:

- `message_id`
- `action_type`
- `status`

The table keeps the derived work separate from the original `emails` records, so action intent survives the graph invocation that created it.

### Action lifecycle and idempotency

Action statuses are `PENDING`, `COMPLETED`, and `FAILED`.

- `STORE` is created with status `COMPLETED`, because `persistNode` has already stored the email before actions are mapped.
- `REVIEW`, `DRAFT_REPLY`, and `ANALYZE_MEETING` are created with status `PENDING`.

Persistence is idempotent on `(message_id, action_type)`. Before insertion, the action node loads existing action keys for the batch and skips an existing key; it also removes duplicate keys produced in the same run. This node does not update an existing action row.

### Conditional routing

After persistence, `routeActions` determines the graph destinations:

- Any `DRAFT_REPLY` action routes to `draftWorkFlow`.
- Any `ANALYZE_MEETING` action routes to `meetingWorkFlow`.
- A batch containing both action types routes to both workflows.
- If neither type is present, the graph ends.

`STORE` and `REVIEW` have no downstream workflow yet. `draftWorkFlow` generates reply drafts for human review. `meetingWorkFlow` remains a placeholder; meeting analysis, Calendar actions, and notifications are not implemented.

---

## Day 8 — Reply Draft Review, Approval, and Sending ✅

Day 8 completes the first human-in-the-loop email workflow:

```text
REQUIRES_REPLY email
      ↓
Generate reply draft
      ↓
PENDING_REVIEW
      ↓
Approve or reject
      ↓
APPROVED
      ↓
Send reply
      ↓
SENT
```

The frontend lists generated drafts and lets the user view the draft body. A draft in `PENDING_REVIEW` can be approved or rejected. Only an `APPROVED` draft can be sent; the backend rejects any attempt to send a draft in another status.

The send flow replies in the original Gmail thread and marks the persisted draft as `SENT` only after Gmail accepts the message. Gmail send permission is now included in the OAuth scopes.

---

## Day 9 — Email Sync API and Draft Review Frontend ✅

This milestone adds the browser-facing pieces needed to review generated replies and keep the local email store current.

### Email sync

The backend now syncs recent Gmail messages automatically when the server starts and at a configurable interval. The default interval is five minutes and can be changed with `SYNC_INTERVAL_MS` in `backend/.env`.

The manual sync endpoint is also available:

```text
POST /api/emails/sync
```

The sync service prevents overlapping runs, checks existing Gmail message IDs before retrieving full message bodies, and inserts only new emails into Supabase.

### Email API

The email API provides:

```text
GET  /api/emails
GET  /api/emails/:id
POST /api/emails/sync
```

The list endpoint supports pagination plus optional `category` and `q` search filters.

### Draft review frontend

The React frontend is now connected to the draft API. It provides:

- A refreshable list of generated drafts with sender, subject, date, status, and reply preview.
- A desktop two-pane review layout and mobile detail navigation.
- Full original-email and proposed-reply views.
- Approval, rejection, and sending controls that follow the backend draft-status rules.
- Loading, success, and error feedback for API operations.

The frontend uses a small typed API client and a Vite `/api` proxy, keeping the backend URL configurable through `VITE_API_URL` instead of embedding it throughout the UI.

The available draft endpoints are:

```text
GET  /api/drafts
GET  /api/drafts/:emailId
POST /api/drafts/:emailId/approve
POST /api/drafts/:emailId/reject
POST /api/drafts/:emailId/send
```

---
## Day 10 â€” Automatic Full Triage + Inbox Dashboard âœ…

This milestone connects the complete triage workflow to the running application instead of limiting it to CLI runs and the draft-review screen.

### Automatic full triage

The server now runs the complete LangGraph pipeline at startup and on the configured interval:

```text
Server start / scheduled interval / manual triage
      â†“
fetch â†’ persist â†’ classify â†’ action â†’ route
      â†“
draft generation when a reply is required
```

The interval defaults to five minutes and is configured with `SYNC_INTERVAL_MS` in `backend/.env`.

`triage.service.ts` owns this reusable operation. It prevents overlapping runs, returns a summary of fetched emails, classifications, actions, and drafts, and is used by:

- Server startup
- Scheduled auto-triage
- `POST /api/triage/run`
- `POST /api/emails/sync`

The older ingestion-only sync service is no longer used by the server scheduler. This ensures automatically discovered emails are also classified, mapped to actions, and drafted when appropriate.

### Inbox dashboard

The React frontend is now an inbox dashboard rather than a draft-only screen.

It provides:

- An inbox list backed by `GET /api/emails`
- Category navigation for Inbox, Needs Attention, Important, Reply needed, Meetings, Informational, Low priority, and Spam
- Sender and subject search
- Pagination for the email list
- Full email detail, including category, classification reason, suggested action, and stored body
- A `Run triage` button backed by `POST /api/triage/run`
- Existing draft approval, rejection, and send controls when a selected email has a reply draft

The Vite development server proxies `/api` requests to the Express backend on port 5000. The frontend production build completes successfully.

### Current MVP state

The core single-user MVP flow is implemented:

```text
Gmail inbox
      â†“
Automatic or manual full triage
      â†“
Inbox dashboard and classification detail
      â†“
Generated reply draft
      â†“
Human approval
      â†“
Reply sent in the original Gmail thread
```

The next work is validation and release hardening: run the complete flow against a test account, resolve the current frontend lint findings, correct the client-side paginated `Needs Attention` filter, and address the existing OAuth/CORS/token-storage security limitations before deployment.

---

## Design Principles

**1. Human approval for external actions**

The agent should never independently send an email or perform an irreversible external action.

```text
AI decision
    ↓
Prepare action
    ↓
Human approval
    ↓
Execute action
```

**2. Separate Gmail integration from agent logic**

Gmail API code stays in the service layer. LangGraph nodes decide what should happen with the data.

```text
Gmail Service
     ↓
Raw Gmail data
     ↓
Email Parser
     ↓
Application Email model
     ↓
LangGraph
     ↓
Agent decisions
```

**3. Persist before making decisions**

The system stores fetched emails before performing AI processing.

```text
Gmail
  ↓
Fetch
  ↓
Persist
  ↓
Classify
  ↓
Route
```

This gives the application a durable source of truth and makes future retries and processing history possible.

**4. Build incrementally**

The project is being built in stages:

```text
Infrastructure
      ↓
Authentication
      ↓
LangGraph
      ↓
Gmail ingestion
      ↓
Persistence
      ↓
Classification
      ↓
Conditional routing
      ↓
Drafting
      ↓
Calendar
      ↓
Notifications
      ↓
Human approval
      ↓
External actions
```

This makes it possible to test each major component independently.

**5. Read-only first**

The current Google scopes are:
- `gmail.readonly`
- `gmail.send`
- `calendar.readonly`

Gmail send permission is used only after the user explicitly approves a generated reply draft.

---

## Project Vision

The long-term goal is not simply to build a Gmail client. The goal is to build an assistant that can answer:

> "What do I need to know or do about my emails today?"

without requiring the user to manually open and process every message.

```text
Inbox
  ↓
Understand
  ↓
Prioritize
  ↓
Decide what needs action
  ↓
Prepare the action
  ↓
Ask the user
  ↓
Execute approved action
```

The end goal is an email assistant that doesn't just read emails — it understands them, decides what matters, prepares the appropriate action, and keeps the human in control of anything important.
