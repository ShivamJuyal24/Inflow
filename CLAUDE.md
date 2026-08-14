# CLAUDE.md

Read `AGENTS.md` first for full project context (stack, architecture, 
current state, limitations). This file only covers how to work in this repo.

## Verification
- No test suite exists yet — don't add one unless asked.
- After backend changes: run `npm run build` (strict TS) then `npm run graph` 
  to confirm the pipeline still runs end-to-end.
- Report what you ran and the output, not just "done."

## Boundaries
- Don't touch `frontend/` unless the task is explicitly about the frontend — 
  it's an untouched Vite stub, leave it that way until asked.
- Don't add new dependencies without asking first.
- Don't modify `.env` or commit secrets.
- Prefer incremental, reviewable diffs over rewriting whole files.

## Current focus
- Next milestone: conditional routing in `routeNode` by classification category.
- `draftNode` and `meetingNode` exist but are unwired — don't wire them in 
  unless that's the specific task.