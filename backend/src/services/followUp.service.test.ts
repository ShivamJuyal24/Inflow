import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  collectEligibleFollowUps,
  runFollowUpSweep,
  markFollowedUp,
} from "./followUp.service";

const { createMock, supabaseMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("../config/groq", () => ({
  groq: { chat: { completions: { create: createMock } } },
}));

vi.mock("../config/supabase", () => ({
  supabase: supabaseMock,
}));

// Each awaited query chain resolves the next queued result, in order.
let results: Array<{ data: any; error: any }>;

function makeChain() {
  const chain: any = {};
  for (const m of [
    "select",
    "eq",
    "is",
    "lt",
    "lte",
    "gt",
    "not",
    "in",
    "limit",
    "order",
    "update",
    "upsert",
    "insert",
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve(results.shift() ?? { data: null, error: null })
  );
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(results.shift() ?? { data: [], error: null }).then(
      onFulfilled,
      onRejected
    );
  return chain;
}

const SENT_DRAFT = {
  id: "draft-1",
  email_id: "email-1",
  sent_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  follow_up_count: 0,
  body: "Thanks for the report — here is my reply.",
};

const EMAIL_ROW = {
  id: "email-1",
  thread_id: "thread-1",
  google_account_id: "acc-1",
  from_email: "sender@example.com",
  subject: "Pricing question",
  body: "What does the pro plan cost?",
};

beforeEach(() => {
  vi.resetAllMocks();
  results = [];
  supabaseMock.from.mockImplementation(() => makeChain());
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("collectEligibleFollowUps", () => {
  it("returns drafts with no reply in the thread", async () => {
    results = [
      { data: [SENT_DRAFT], error: null }, // candidate scan
      { data: EMAIL_ROW, error: null }, // email lookup (maybeSingle)
      { data: [], error: null }, // reply check: none
    ];

    const eligible = await collectEligibleFollowUps();

    expect(eligible).toHaveLength(1);
    expect(eligible[0]).toMatchObject({
      draftId: "draft-1",
      emailId: "email-1",
      threadId: "thread-1",
      recipientEmail: "sender@example.com",
      sentDraftBody: SENT_DRAFT.body,
    });
  });

  it("excludes drafts whose thread got a reply and stamps them", async () => {
    results = [
      { data: [SENT_DRAFT], error: null }, // candidate scan
      { data: EMAIL_ROW, error: null }, // email lookup
      { data: [{ id: "email-2" }], error: null }, // reply exists
      { data: null, error: null }, // markFollowedUp update
    ];

    const eligible = await collectEligibleFollowUps();

    expect(eligible).toHaveLength(0);
  });

  it("returns nothing when there are no candidates", async () => {
    results = [{ data: [], error: null }];

    expect(await collectEligibleFollowUps()).toEqual([]);
  });
});

describe("runFollowUpSweep", () => {
  it("generates a follow_up draft and closes the original", async () => {
    results = [
      { data: [SENT_DRAFT], error: null }, // candidate scan
      { data: EMAIL_ROW, error: null }, // email lookup
      { data: [], error: null }, // no reply
      { data: null, error: null }, // insert follow_up draft
      { data: null, error: null }, // update original draft
    ];
    createMock.mockResolvedValue({
      choices: [{ message: { content: "Just bumping this — any thoughts?" } }],
    });

    const { generated, skipped } = await runFollowUpSweep();

    expect(generated).toBe(1);
    expect(skipped).toBe(0);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("skips persisting when Groq returns empty content", async () => {
    results = [
      { data: [SENT_DRAFT], error: null },
      { data: EMAIL_ROW, error: null },
      { data: [], error: null },
    ];
    createMock.mockResolvedValue({ choices: [{ message: { content: "" } }] });

    const { generated, skipped } = await runFollowUpSweep();

    expect(generated).toBe(0);
    expect(skipped).toBe(1);
  });

  it("stops early on a 429 rate limit", async () => {
    const second = { ...SENT_DRAFT, id: "draft-2" };
    results = [
      { data: [SENT_DRAFT, second], error: null },
      { data: EMAIL_ROW, error: null },
      { data: [], error: null },
      { data: EMAIL_ROW, error: null },
      { data: [], error: null },
    ];
    const err: any = new Error("rate limited");
    err.status = 429;
    createMock.mockRejectedValue(err);

    const { generated, skipped } = await runFollowUpSweep();

    expect(generated).toBe(0);
    expect(skipped).toBe(1);
    expect(createMock).toHaveBeenCalledTimes(1); // never tried draft-2
  });
});

describe("markFollowedUp", () => {
  it("stamps followed_up_at", async () => {
    results = [{ data: null, error: null }];

    await expect(markFollowedUp("draft-1")).resolves.toBeUndefined();
  });
});
