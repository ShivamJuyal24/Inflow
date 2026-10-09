import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { classifyNode } from "./nodes";
import { createFakeSupabase } from "../test/mocks/fakeSupabase.js";

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

// Mock the classifier coordinator and its dependencies
const { classifyWithFallbackMock, resetCircuitBreakersMock, getClassifierOrderMock } = vi.hoisted(() => ({
  classifyWithFallbackMock: vi.fn(),
  resetCircuitBreakersMock: vi.fn(),
  getClassifierOrderMock: vi.fn(() => ["groq", "jev"]),
}));

vi.mock("../config/supabase", () => ({ supabase: supabaseMock }));
vi.mock("../config/groq", () => ({ groq: {} }));
vi.mock("../services/gmail.service", () => ({
  getMessage: vi.fn(),
  listAllMessages: vi.fn(),
  listMessagePage: vi.fn(),
}));
vi.mock("../services/email.parser", () => ({ parseGmailMessage: vi.fn() }));
vi.mock("../config/gmailSync", () => ({ getGmailSyncConfig: vi.fn() }));
vi.mock("./actionMapper", () => ({ mapClassificationToAction: vi.fn() }));
vi.mock("./classifier", () => ({
  classifyWithFallback: classifyWithFallbackMock,
  persistClassification: vi.fn(), // Will use real implementation via supabase mock
  resetCircuitBreakers: resetCircuitBreakersMock,
  getClassifierOrder: getClassifierOrderMock,
}));
vi.mock("./jevClassifier", () => ({
  cleanEmailBody: (body: string) => body,
  CATEGORY_DETAILS: {
    SPAM: { reason: "spam reason", suggested_action: "spam action" },
    LOW_PRIORITY: { reason: "low reason", suggested_action: "low action" },
    INFORMATIONAL: { reason: "info reason", suggested_action: "info action" },
    REQUIRES_REPLY: { reason: "reply reason", suggested_action: "reply action" },
    MEETING: { reason: "meeting reason", suggested_action: "meeting action" },
    IMPORTANT: { reason: "important reason", suggested_action: "important action" },
  },
  classifyWithJev: vi.fn(),
  isQuotaError: vi.fn(),
}));
vi.mock("../services/email.parser", () => ({
  cleanEmailBody: (body: string) => body,
  classifyByHeaders: (signals: any) => {
    // Default: return null (no header-based classification)
    return null;
  },
  extractClassificationSignals: vi.fn(),
  cleanBodyForClassification: vi.fn(),
  parseGmailMessage: vi.fn(),
  parseReceivedAt: vi.fn(),
  stripQuotedAndSignatures: vi.fn(),
}));

const email = (id: string, labels?: string[]) => ({
  id,
  threadId: `t-${id}`,
  from: "sender@example.com",
  to: "me@example.com",
  subject: `Subject ${id}`,
  body: `Body of ${id}`,
  receivedAt: "2026-10-01T00:00:00.000Z",
  labels,
});

const unclassifiedRow = (messageId: string, overrides: Record<string, any> = {}) => ({
  message_id: messageId,
  google_account_id: "account-1",
  category: null,
  classification_reason: null,
  suggested_action: null,
  classified_at: null,
  classification_status: "pending",
  classification_error: null,
  classifier_model: null,
  ...overrides,
});

const classifiedRow = (messageId: string, category: string, overrides: Record<string, any> = {}) => ({
  message_id: messageId,
  google_account_id: "account-1",
  category,
  classification_reason: "stored reason",
  suggested_action: "stored action",
  classified_at: "2026-10-01T00:00:00.000Z",
  classification_status: "classified",
  classification_error: null,
  classifier_model: "groq",
  ...overrides,
});

const stateFor = (...ids: string[]) =>
  ({
    emails: ids.map((id) => email(id)),
    classification: [],
    googleAccountId: "account-1",
  }) as any;

const stateForEmails = (emails: any[]) =>
  ({ emails, classification: [], googleAccountId: "account-1" }) as any;

/** The node sleeps between provider calls; run it on fake timers. */
async function run(state: any) {
  const promise = classifyNode(state);
  await vi.runAllTimersAsync();
  return promise;
}

const idsOf = (result: any) =>
  (result.classification as { messageId: string }[]).map((c) => c.messageId);

function setup(rows: Record<string, any>[]) {
  const fake = createFakeSupabase({ emails: rows });
  supabaseMock.from.mockImplementation(fake.from);
  return fake;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.stubEnv("GROQ_CLASSIFY_KEY", "test-groq-key");
  vi.stubEnv("JEVMODEL_API_KEY", "test-jev-key");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  // Default mock implementations
  resetCircuitBreakersMock.mockImplementation(() => {});
  getClassifierOrderMock.mockReturnValue(["groq", "jev"]);
  classifyWithFallbackMock.mockResolvedValue({
    category: "REQUIRES_REPLY",
    classifierModel: "groq",
    tokensUsed: 50,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("classifyNode", () => {
  it("returns nothing and touches nothing when there are no emails", async () => {
    setup([]);

    const result = await classifyNode({ emails: [], classification: [] } as any);

    expect(result).toEqual({ classification: [] });
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(classifyWithFallbackMock).not.toHaveBeenCalled();
  });

  it("classifies a new email, stores the result and returns it", async () => {
    const fake = setup([unclassifiedRow("m1")]);
    classifyWithFallbackMock.mockResolvedValueOnce({
      category: "REQUIRES_REPLY",
      classifierModel: "groq",
      tokensUsed: 50,
    });

    const result = await run(stateFor("m1"));

    expect(result.classification).toEqual([
      expect.objectContaining({ messageId: "m1", category: "REQUIRES_REPLY" }),
    ]);
    expect(fake.tables.emails[0].category).toBe("REQUIRES_REPLY");
    expect(fake.tables.emails[0].classification_status).toBe("classified");
    expect(fake.tables.emails[0].classifier_model).toBe("groq");
    expect(classifyWithFallbackMock).toHaveBeenCalledTimes(1);
  });

  it("reuses stored classifications without calling the provider", async () => {
    setup([classifiedRow("m1", "SPAM")]);

    const result = await run(stateFor("m1"));

    expect(classifyWithFallbackMock).not.toHaveBeenCalled();
    expect(result.classification).toEqual([
      {
        messageId: "m1",
        category: "SPAM",
        reason: "stored reason",
        suggested_action: "stored action",
      },
    ]);
  });

  it("does not reuse a stored classification from another Google account", async () => {
    const fake = setup([
      {
        ...classifiedRow("m1", "SPAM"),
        google_account_id: "different-account",
      },
    ]);
    classifyWithFallbackMock.mockResolvedValueOnce({
      category: "IMPORTANT",
      classifierModel: "groq",
      tokensUsed: 50,
    });

    const result = await run(stateFor("m1"));

    // The email is not owned by this account, so it's not in pendingIds
    // classifyWithFallback should NOT be called
    expect(classifyWithFallbackMock).not.toHaveBeenCalled();
    expect(result.classification).toEqual([]);
    expect(fake.tables.emails[0].category).toBe("SPAM"); // unchanged
  });

  it("does not update an email belonging to another Google account", async () => {
    const fake = setup([
      {
        ...unclassifiedRow("m1"),
        google_account_id: "different-account",
      },
    ]);
    classifyWithFallbackMock.mockResolvedValueOnce({
      category: "IMPORTANT",
      classifierModel: "groq",
      tokensUsed: 50,
    });

    const result = await run(stateFor("m1"));

    // The email is not owned by this account, so it's not in pendingIds
    expect(classifyWithFallbackMock).not.toHaveBeenCalled();
    expect(result.classification).toEqual([]);
    expect(fake.tables.emails[0].category).toBeNull();
  });

  it("omits an email whose provider call fails, but still classifies the rest", async () => {
    const fake = setup([unclassifiedRow("m1"), unclassifiedRow("m2")]);
    classifyWithFallbackMock
      .mockRejectedValueOnce(new Error("provider error"))
      .mockResolvedValueOnce({
        category: "MEETING",
        classifierModel: "groq",
        tokensUsed: 50,
      });

    const result = await run(stateFor("m1", "m2"));

    expect(idsOf(result)).toEqual(["m2"]);
    expect(fake.tables.emails[0].classification_status).toBe("failed");
    expect(fake.tables.emails[0].classification_error).toBe("provider error");
    expect(fake.tables.emails[1].category).toBe("MEETING");
    expect(fake.tables.emails[1].classification_status).toBe("classified");
  });

  it("omits an email when the provider returns an invalid category", async () => {
    const fake = setup([unclassifiedRow("m1")]);
    classifyWithFallbackMock.mockRejectedValueOnce(
      new Error('Invalid category "NOT_A_CATEGORY"')
    );

    const result = await run(stateFor("m1"));

    expect(result.classification).toEqual([]);
    expect(fake.tables.emails[0].classification_status).toBe("failed");
  });

  it("does not count a classification whose database write failed", async () => {
    const fake = setup([unclassifiedRow("m1")]);
    classifyWithFallbackMock.mockResolvedValueOnce({
      category: "IMPORTANT",
      classifierModel: "groq",
      tokensUsed: 50,
    });
    // Make the update fail
    fake.failNext("emails", "update", "db down");

    const result = await run(stateFor("m1"));

    expect(result.classification).toEqual([]);
    expect(fake.tables.emails[0].category).toBeNull();
  });

  it("does not count a classification when no email row was updated", async () => {
    setup([]); // the email was never persisted
    classifyWithFallbackMock.mockResolvedValueOnce({
      category: "IMPORTANT",
      classifierModel: "groq",
      tokensUsed: 50,
    });

    const result = await run(stateFor("m1"));

    expect(result.classification).toEqual([]);
  });

  it("stops the batch on a rate limit and leaves the rest for the next run", async () => {
    const fake = setup([
      unclassifiedRow("m1"),
      unclassifiedRow("m2"),
      unclassifiedRow("m3"),
    ]);
    classifyWithFallbackMock
      .mockResolvedValueOnce({
        category: "LOW_PRIORITY",
        classifierModel: "groq",
        tokensUsed: 50,
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("429 rate limit"), { status: 429 })
      );

    const result = await run(stateFor("m1", "m2", "m3"));

    expect(idsOf(result)).toEqual(["m1"]);
    expect(classifyWithFallbackMock).toHaveBeenCalledTimes(2); // m3 was never attempted
    expect(fake.tables.emails[0].category).toBe("LOW_PRIORITY");
    expect(fake.tables.emails[1].classification_status).toBe("pending"); // left for retry
    expect(fake.tables.emails[2].classification_status).toBe("pending");
  });

  it("fails the run when no LLM classifiers are configured", async () => {
    setup([unclassifiedRow("m1")]);
    vi.stubEnv("GROQ_CLASSIFY_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("JEVMODEL_API_KEY", "");
    getClassifierOrderMock.mockReturnValue(["groq", "jev"]);

    await expect(classifyNode(stateFor("m1"))).rejects.toThrow(
      /No LLM classifiers configured/
    );
    expect(classifyWithFallbackMock).not.toHaveBeenCalled();
  });

  it("classifies Gmail low-value categories deterministically without calling the provider", async () => {
    const fake = setup([
      unclassifiedRow("m1"),
      unclassifiedRow("m2"),
      unclassifiedRow("m3"),
      unclassifiedRow("m4"),
    ]);

    const state = stateForEmails([
      email("m1", ["INBOX", "CATEGORY_PROMOTIONS"]),
      email("m2", ["INBOX", "CATEGORY_SOCIAL"]),
      email("m3", ["INBOX", "CATEGORY_FORUMS"]),
      email("m4", ["INBOX", "CATEGORY_PRIMARY"]),
    ]);

    classifyWithFallbackMock.mockResolvedValueOnce({
      category: "IMPORTANT",
      classifierModel: "groq",
      tokensUsed: 50,
    });

    const result = await run(state);

    // Only m4 went to the LLM (m1-m3 are LOW_PRIORITY via rules)
    expect(classifyWithFallbackMock).toHaveBeenCalledTimes(1);
    const byId = new Map(
      (result.classification as any[]).map((c) => [c.messageId, c])
    );
    expect(byId.get("m1")?.category).toBe("LOW_PRIORITY");
    expect(byId.get("m2")?.category).toBe("LOW_PRIORITY");
    expect(byId.get("m3")?.category).toBe("LOW_PRIORITY");
    expect(byId.get("m4")?.category).toBe("IMPORTANT");
    expect(fake.tables.emails[0].classifier_model).toBe("rules");
    expect(fake.tables.emails[1].classifier_model).toBe("rules");
    expect(fake.tables.emails[2].classifier_model).toBe("rules");
    expect(fake.tables.emails[3].classifier_model).toBe("groq");
  });

  it("still sends CATEGORY_UPDATES emails to the LLM provider", async () => {
    setup([unclassifiedRow("m1")]);
    classifyWithFallbackMock.mockResolvedValueOnce({
      category: "INFORMATIONAL",
      classifierModel: "groq",
      tokensUsed: 50,
    });

    const result = await run(
      stateForEmails([email("m1", ["INBOX", "CATEGORY_UPDATES"])])
    );

    expect(classifyWithFallbackMock).toHaveBeenCalledTimes(1);
    expect(idsOf(result)).toEqual(["m1"]);
  });

  it("does not need the API key when everything is already classified", async () => {
    setup([classifiedRow("m1", "SPAM")]);
    vi.stubEnv("GROQ_CLASSIFY_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("JEVMODEL_API_KEY", "");
    getClassifierOrderMock.mockReturnValue(["groq", "jev"]);

    const result = await run(stateFor("m1"));

    expect(idsOf(result)).toEqual(["m1"]);
    expect(classifyWithFallbackMock).not.toHaveBeenCalled();
  });
});