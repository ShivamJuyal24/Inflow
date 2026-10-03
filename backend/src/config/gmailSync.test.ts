import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getGmailSyncConfig,
  DEFAULT_GMAIL_PAGE_SIZE,
  DEFAULT_GMAIL_MAX_MESSAGES,
  GMAIL_MAX_PAGE_SIZE,
} from "./gmailSync";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getGmailSyncConfig", () => {
  it("falls back to defaults when the env vars are unset or blank", () => {
    vi.stubEnv("GMAIL_PAGE_SIZE", "");
    vi.stubEnv("GMAIL_MAX_MESSAGES", "");

    expect(getGmailSyncConfig()).toEqual({
      pageSize: DEFAULT_GMAIL_PAGE_SIZE,
      maxMessages: DEFAULT_GMAIL_MAX_MESSAGES,
      maxScan: 1000,
    });
  });

  it("reads configured values", () => {
    vi.stubEnv("GMAIL_PAGE_SIZE", "250");
    vi.stubEnv("GMAIL_MAX_MESSAGES", "300");

    expect(getGmailSyncConfig()).toEqual({
      pageSize: 250,
      maxMessages: 300,
      maxScan: 1000,
    });
  });

  it("clamps the page size to Gmail's 500-request maximum", () => {
    vi.stubEnv("GMAIL_PAGE_SIZE", "5000");

    expect(getGmailSyncConfig().pageSize).toBe(GMAIL_MAX_PAGE_SIZE);
  });

  it("clamps the page size to at least 1", () => {
    vi.stubEnv("GMAIL_PAGE_SIZE", "-5");

    expect(getGmailSyncConfig().pageSize).toBe(1);
  });

  it("clamps maxMessages to at least 1", () => {
    vi.stubEnv("GMAIL_MAX_MESSAGES", "-5");

    expect(getGmailSyncConfig().maxMessages).toBe(1);
  });
});
