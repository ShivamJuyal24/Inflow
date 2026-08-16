# CLAUDE.md

Read `AGENTS.md` first for full project context (stack, architecture, 
current state, limitations). This file only covers how to work in this repo.

## Verification
- No test suite exists yet — don't add one unless asked.
- After backend changes: run `npm run build` (strict TS), then verify the 
  relevant path:
  - Full live pipeline: `npm run gmail`
  - Draft node in isolation: `npm run draft`
  - Routing logic only: `tsx src/graph/testRouting.ts`
- Report what you ran and the output, not just "done."

## Boundaries
- Don't touch `frontend/` unless the task is explicitly about the frontend — 
  it's an untouched Vite stub, leave it that way until asked.
- Don't add new dependencies without asking first.
- Don't modify `.env` or commit secrets.
- Prefer incremental, reviewable diffs over rewriting whole files.

## Current focus
- Conditional routing (`routeActions`) and action persistence are implemented.
- Reply draft generation (`draftNode` / `draftWorkFlow`) is implemented and 
  wired; it persists to `drafts` and marks `DRAFT_REPLY` actions completed.
- `meetingNode` / `meetingWorkFlow` is wired but still a stub — the natural 
  next milestone unless the task says otherwise.
- Other known gaps worth tackling when relevant: classification DB persistence, 
  skip re-classifying already-processed emails, `REVIEW` downstream handling.
