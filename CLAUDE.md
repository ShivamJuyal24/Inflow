# CLAUDE.md

Read `AGENTS.md` first for full project context (stack, architecture, current state, conventions). This file only covers how to work in this repo.

## Verification

- Run tests with `npm test` (Vitest) in `backend/` after meaningful changes; add or update tests for new filtering/classification behavior.
- After backend changes: `npx tsc --noEmit` must be clean, then run the relevant path:
  - Full live pipeline: `npm run gmail`
  - Draft node in isolation: `npm run draft`
  - Graph in isolation: `npm run graph`
- Frontend changes: `npm run build` (runs `tsc -b` then Vite) in `frontend/`, optionally `npm run lint`.
- Report what you ran and the output, not just "done."

## Boundaries

- Don't touch `frontend/` unless the task is explicitly about the frontend.
- Don't add new dependencies without asking first.
- Don't modify `.env` or commit secrets; `.env.example` templates are safe to edit.
- Prefer incremental, reviewable diffs over rewriting whole files.

## Current focus areas

- Classification cost control is implemented: Gmail label shortcuts (Promotions/Social/Forums → deterministic `LOW_PRIORITY`), bounded batch sizes, head+tail body sampling, and paced provider calls. Preserve these when touching the classify path.
- `meetingNode` / `meetingWorkFlow` is wired but still a stub — the natural next milestone unless the task says otherwise.
- Known gaps to tackle when relevant: `REVIEW` downstream handling, cross-domain OAuth cookie hardening, notification channel.
