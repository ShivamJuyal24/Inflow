import { describe, it, expect, vi, beforeEach } from "vitest";
import { runInboxTriage } from "./triage.service";

const { invokeMock, supabaseMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("../graph/graph", () => ({
  graph: {
    invoke: invokeMock,
  },
}));

vi.mock("../config/supabase", () => ({
  supabase: supabaseMock,
}));

const email = (id: string) => ({ id });
const classification = (messageId: string) => ({ messageId });

function setupOwnedAccounts(userIds: string[]) {
  const chain: any = {};

  chain.select = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve({
      data: userIds.map((userId) => ({ user_id: userId })),
      error: null,
    }).then(onFulfilled, onRejected);

  supabaseMock.from.mockReturnValue(chain);
}

beforeEach(() => {
  vi.resetAllMocks();

  // Default: the user has a connected Google account, and background
  // enumeration finds no owned accounts (individual tests override).
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: { id: "account-1" }, error: null })
  );
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  supabaseMock.from.mockReturnValue(chain);

  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runInboxTriage summary", () => {
  it("reports COMPLETED when every fetched email was classified", async () => {
    invokeMock.mockResolvedValue({
      emails: [email("a"), email("b")],
      classification: [classification("a"), classification("b")],
      actions: [{ type: "DRAFT_REPLY" }, { type: "ANALYZE_MEETING" }],
      drafts: [{ status: "PENDING_REVIEW" }],
    });

    const { summary } = await runInboxTriage(
      "manual",
      "user-1"
    );

    expect(summary).toMatchObject({
      emailsFetched: 2,
      emailsClassified: 2,
      emailsUnclassified: 0,
      actionsCreated: 2,
      draftsCreated: 1,
      draftsPendingReview: 1,
      meetingActions: 1,
      status: "COMPLETED",
    });

    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
      })
    );
  });

  it("reports PARTIAL with a failure count when some emails were not classified", async () => {
    invokeMock.mockResolvedValue({
      emails: [email("a"), email("b"), email("c")],
      classification: [classification("a")],
      actions: [],
      drafts: [],
    });

    setupOwnedAccounts(["user-1"]);

    const { summary } = await runInboxTriage("scheduled");

    expect(summary.emailsFetched).toBe(3);
    expect(summary.emailsClassified).toBe(1);
    expect(summary.emailsUnclassified).toBe(2);
    expect(summary.status).toBe("PARTIAL");
  });

  it("does not count previously classified emails outside this batch as failures", async () => {
    invokeMock.mockResolvedValue({
      emails: [email("a")],
      classification: [classification("a"), classification("old")],
      actions: [],
      drafts: [],
    });

    const { summary } = await runInboxTriage(
      "manual",
      "user-1"
    );

    expect(summary.emailsUnclassified).toBe(0);
    expect(summary.status).toBe("COMPLETED");
  });

  it("handles an empty manual run", async () => {
    invokeMock.mockResolvedValue({});

    const { summary } = await runInboxTriage(
      "manual",
      "user-1"
    );

    expect(summary).toMatchObject({
      emailsFetched: 0,
      emailsUnclassified: 0,
      status: "COMPLETED",
    });
  });

  it("requires a user ID for manual triage", async () => {
    await expect(
      runInboxTriage("manual")
    ).rejects.toThrow("TRIAGE_USER_REQUIRED");

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("runs scheduled triage once for each owned user", async () => {
    setupOwnedAccounts(["user-1", "user-2"]);

    invokeMock
      .mockResolvedValueOnce({
        emails: [email("a")],
        classification: [classification("a")],
        actions: [],
        drafts: [],
      })
      .mockResolvedValueOnce({
        emails: [email("b")],
        classification: [classification("b")],
        actions: [],
        drafts: [],
      });

    const { summary } = await runInboxTriage("scheduled");

    expect(invokeMock).toHaveBeenCalledTimes(2);

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: "user-1",
      })
    );

    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId: "user-2",
      })
    );

    expect(summary).toMatchObject({
      emailsFetched: 2,
      emailsClassified: 2,
      emailsUnclassified: 0,
      status: "COMPLETED",
    });
  });

  it("does not run background triage when no Google account is owned by a user", async () => {
    setupOwnedAccounts([]);

    const { summary } = await runInboxTriage("startup");

    expect(invokeMock).not.toHaveBeenCalled();

    expect(summary).toMatchObject({
      emailsFetched: 0,
      emailsClassified: 0,
      emailsUnclassified: 0,
      status: "COMPLETED",
    });
  });

  it("still releases the in-progress lock when the graph throws", async () => {
    invokeMock.mockRejectedValueOnce(new Error("boom"));

    await expect(
      runInboxTriage("manual", "user-1")
    ).rejects.toThrow("boom");

    invokeMock.mockResolvedValue({});

    await expect(
      runInboxTriage("manual", "user-1")
    ).resolves.toBeDefined();
  });
});