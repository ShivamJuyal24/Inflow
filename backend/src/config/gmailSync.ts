// backend/src/config/gmailSync.ts
import dotenv from "dotenv";

dotenv.config();

/** Gmail caps users.messages.list page size at 500. */
export const GMAIL_MAX_PAGE_SIZE = 500;


export const DEFAULT_GMAIL_PAGE_SIZE = 100;
export const DEFAULT_GMAIL_MAX_MESSAGES = 100;

export type GmailSyncConfig = {
  /** Messages requested per Gmail API call (1..500). */
  pageSize: number;
  /** Ceiling on messages considered per triage run. */
  maxMessages: number;

  maxScan: number;
};

/**
 * Gmail fetch tuning for a triage run.
 *
 * - GMAIL_PAGE_SIZE: messages per list request (default 100, capped at
 *   Gmail's 500-request maximum).
 * - GMAIL_MAX_MESSAGES: overall ceiling per run (default 100). Runs are
 *   scheduled every SYNC_INTERVAL_MS, so a bounded window keeps each
 *   run's LLM cost and duration predictable while still draining the
 *   backlog incrementally.
 *
 * Values are read at call time so dotenv timing never matters.
 */
export function getGmailSyncConfig(): GmailSyncConfig {
  const pageSize =
    Number(process.env.GMAIL_PAGE_SIZE) || DEFAULT_GMAIL_PAGE_SIZE;
  const maxMessages =
    Number(process.env.GMAIL_MAX_MESSAGES) || DEFAULT_GMAIL_MAX_MESSAGES;

  return {
    pageSize: Math.min(Math.max(Math.trunc(pageSize), 1), GMAIL_MAX_PAGE_SIZE),
    maxMessages: Math.max(Math.trunc(maxMessages), 1),
    maxScan: Math.max(Math.trunc(Number(process.env.GMAIL_MAX_SCAN) || 1000), 1),
  };
}
