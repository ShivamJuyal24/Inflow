import { describe, it, expect, vi, beforeEach } from "vitest";
import { runInboxTriage } from "./triage.service";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("../graph/graph", () => ({ graph: { invoke: invokeMock } }));

const email = (id: string) => ({ id });
const classification = (messageId: string) => ({ messageId });

beforeEach(() => {
  vi.resetAllMocks();
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

    const { summary } = await runInboxTriage("manual");

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
  });

  it("reports PARTIAL with a failure count when some emails were not classified", async () => {
    invokeMock.mockResolvedValue({
      emails: [email("a"), email("b"), email("c")],
      classification: [classification("a")],
      actions: [],
      drafts: [],
    });

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

    const { summary } = await runInboxTriage("startup");

    expect(summary.emailsUnclassified).toBe(0);
    expect(summary.status).toBe("COMPLETED");
  });

  it("handles an empty run", async () => {
    invokeMock.mockResolvedValue({});

    const { summary } = await runInboxTriage("manual");

    expect(summary).toMatchObject({
      emailsFetched: 0,
      emailsUnclassified: 0,
      status: "COMPLETED",
    });
  });

  it("still releases the in-progress lock when the graph throws", async () => {
    invokeMock.mockRejectedValueOnce(new Error("boom"));
    await expect(runInboxTriage("manual")).rejects.toThrow("boom");

    invokeMock.mockResolvedValue({});
    await expect(runInboxTriage("manual")).resolves.toBeDefined();
  });
});
