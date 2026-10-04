import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { classifyNode } from "./nodes";
import { createFakeSupabase } from "../test/mocks/fakeSupabase.js";

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

// nodes.ts pulls in several modules that need real credentials or network
// access. None of them are used by classifyNode.
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

const fetchMock = vi.fn();

const jevOk = (choice: string) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({ answers: { category: { choice } } }),
});

const jevError = (status: number, message = "provider error") => ({
  ok: false,
  status,
  statusText: "error",
  json: async () => ({ error: { message } }),
});

const email = (id: string) => ({
  id,
  threadId: `t-${id}`,
  from: "sender@example.com",
  to: "me@example.com",
  subject: `Subject ${id}`,
  body: `Body of ${id}`,
  receivedAt: "2026-10-01T00:00:00.000Z",
});

const unclassifiedRow = (messageId: string) => ({
  message_id: messageId,
  google_account_id: "account-1",
  category: null,
  classification_reason: null,
  suggested_action: null,
  classified_at: null,
});

const stateFor = (...ids: string[]) =>
  ({
    emails: ids.map(email),
    classification: [],
    googleAccountId: "account-1",
  }) as any;

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
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("JEVMODEL_API_KEY", "test-key");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies a new email, stores the result and returns it", async () => {
    const fake = setup([unclassifiedRow("m1")]);
    fetchMock.mockResolvedValueOnce(jevOk("REQUIRES_REPLY"));

    const result = await run(stateFor("m1"));

    expect(result.classification).toEqual([
      expect.objectContaining({ messageId: "m1", category: "REQUIRES_REPLY" }),
    ]);
    expect(fake.tables.emails[0].category).toBe("REQUIRES_REPLY");
    expect(fake.tables.emails[0].classified_at).toBeTruthy();
  });

  it("reuses stored classifications without calling the provider", async () => {
    setup([
      {
        ...unclassifiedRow("m1"),
        category: "SPAM",
        classification_reason: "stored reason",
        suggested_action: "stored action",
      },
    ]);

    const result = await run(stateFor("m1"));

    expect(fetchMock).not.toHaveBeenCalled();
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
        ...unclassifiedRow("m1"),
        google_account_id: "different-account",
        category: "SPAM",
        classification_reason: "other user's classification",
        suggested_action: "ignore",
      },
    ]);

    fetchMock.mockResolvedValueOnce(jevOk("IMPORTANT"));

    const result = await run(stateFor("m1"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.classification).toEqual([]);
    expect(fake.tables.emails[0].category).toBe("SPAM");
  });

  it("does not update an email belonging to another Google account", async () => {
    const fake = setup([
      {
        ...unclassifiedRow("m1"),
        google_account_id: "different-account",
      },
    ]);

    fetchMock.mockResolvedValueOnce(jevOk("IMPORTANT"));

    const result = await run(stateFor("m1"));

    expect(result.classification).toEqual([]);
    expect(fake.tables.emails[0].category).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits an email whose provider call fails, but still classifies the rest", async () => {
    const fake = setup([unclassifiedRow("m1"), unclassifiedRow("m2")]);
    fetchMock
      .mockResolvedValueOnce(jevError(500))
      .mockResolvedValueOnce(jevOk("MEETING"));

    const result = await run(stateFor("m1", "m2"));

    expect(idsOf(result)).toEqual(["m2"]);
    // The failed email stays unclassified so the next run retries it.
    expect(fake.tables.emails[0].category).toBeNull();
    expect(fake.tables.emails[1].category).toBe("MEETING");
  });

  it("omits an email when the provider returns an invalid category", async () => {
    const fake = setup([unclassifiedRow("m1")]);
    fetchMock.mockResolvedValueOnce(jevOk("NOT_A_CATEGORY"));

    const result = await run(stateFor("m1"));

    expect(result.classification).toEqual([]);
    expect(fake.tables.emails[0].category).toBeNull();
  });

  it("does not count a classification whose database write failed", async () => {
    const fake = setup([unclassifiedRow("m1")]);
    fetchMock.mockResolvedValueOnce(jevOk("IMPORTANT"));
    fake.failNext("emails", "update", "db down");

    const result = await run(stateFor("m1"));

    expect(result.classification).toEqual([]);
    expect(fake.tables.emails[0].category).toBeNull();
  });

  it("does not count a classification when no email row was updated", async () => {
    setup([]); // the email was never persisted
    fetchMock.mockResolvedValueOnce(jevOk("IMPORTANT"));

    const result = await run(stateFor("m1"));

    expect(result.classification).toEqual([]);
  });

  it("stops the batch on a rate limit and leaves the rest for the next run", async () => {
    const fake = setup([
      unclassifiedRow("m1"),
      unclassifiedRow("m2"),
      unclassifiedRow("m3"),
    ]);
    fetchMock
      .mockResolvedValueOnce(jevOk("LOW_PRIORITY"))
      .mockResolvedValueOnce(jevError(429, "slow down"));

    const result = await run(stateFor("m1", "m2", "m3"));

    expect(idsOf(result)).toEqual(["m1"]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // m3 was never attempted
    expect(fake.tables.emails[1].category).toBeNull();
    expect(fake.tables.emails[2].category).toBeNull();
  });

  it("fails the run when the API key is missing instead of skipping every email", async () => {
    setup([unclassifiedRow("m1")]);
    vi.stubEnv("JEVMODEL_API_KEY", "");

    await expect(classifyNode(stateFor("m1"))).rejects.toThrow(
      /JEVMODEL_API_KEY/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not need the API key when everything is already classified", async () => {
    setup([{ ...unclassifiedRow("m1"), category: "SPAM" }]);
    vi.stubEnv("JEVMODEL_API_KEY", "");

    const result = await run(stateFor("m1"));

    expect(idsOf(result)).toEqual(["m1"]);
  });
});


