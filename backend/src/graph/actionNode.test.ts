import { describe, it, expect, vi, beforeEach } from "vitest";
import { actionNode } from "./nodes";
import type { EmailTriageState } from "./state";
import type { EmailClassification } from "../types/classification";
import { createChain } from "../test/mocks/supabase";

const { supabaseMock, groqMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
  groqMock: {
    groq: {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    },
  },
}));

vi.mock("../config/supabase", () => ({ supabase: supabaseMock }));
vi.mock("../config/groq", () => ({ groq: groqMock.groq }));
vi.mock("../services/gmail.service", () => ({
  getMessage: vi.fn(),
  listMessages: vi.fn(),
  sendReply: vi.fn(),
}));
vi.mock("../services/email.parser", () => ({ parseGmailMessage: vi.fn() }));

const classification = (
  messageId: string,
  category: EmailClassification["category"]
): EmailClassification => ({
  messageId,
  category,
  reason: "reason",
  suggested_action: "action",
});

const stateWith = (classifications: EmailClassification[]) =>
  ({ classification: classifications }) as unknown as EmailTriageState;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("actionNode", () => {
  it("persists new actions with mapped statuses", async () => {
    const existingCheck = createChain({ data: [], error: null });
    const insertChain = createChain({
      data: [{ message_id: "m1" }, { message_id: "m2" }],
      error: null,
    });
    supabaseMock.from
      .mockReturnValueOnce(existingCheck)
      .mockReturnValueOnce(insertChain);

    const result = await actionNode(
      stateWith([
        classification("m1", "SPAM"),
        classification("m2", "REQUIRES_REPLY"),
      ])
    );

    expect(insertChain.insert).toHaveBeenCalledWith([
      { message_id: "m1", action_type: "STORE", status: "COMPLETED" },
      { message_id: "m2", action_type: "DRAFT_REPLY", status: "PENDING" },
    ]);
    expect(result.actions).toHaveLength(2);
  });

  it("deduplicates duplicate actions within a single run", async () => {
    const existingCheck = createChain({ data: [], error: null });
    const insertChain = createChain({ data: [{ message_id: "m1" }], error: null });
    supabaseMock.from
      .mockReturnValueOnce(existingCheck)
      .mockReturnValueOnce(insertChain);

    // Two classifications mapping to the same (messageId, action_type) pair
    await actionNode(
      stateWith([
        classification("m1", "REQUIRES_REPLY"),
        classification("m1", "REQUIRES_REPLY"),
      ])
    );

    expect(insertChain.insert).toHaveBeenCalledTimes(1);
    expect(insertChain.insert).toHaveBeenCalledWith([
      { message_id: "m1", action_type: "DRAFT_REPLY", status: "PENDING" },
    ]);
  });

  it("skips actions that already exist in the database", async () => {
    const existingCheck = createChain({
      data: [{ message_id: "m1", action_type: "DRAFT_REPLY" }],
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(existingCheck);

    const result = await actionNode(
      stateWith([classification("m1", "REQUIRES_REPLY")])
    );

    // Only ONE query total — the insert must never happen
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(result.actions).toHaveLength(1);
  });

  it("inserts only the new actions when some already exist", async () => {
    const existingCheck = createChain({
      data: [{ message_id: "m1", action_type: "DRAFT_REPLY" }],
      error: null,
    });
    const insertChain = createChain({ data: [{ message_id: "m2" }], error: null });
    supabaseMock.from
      .mockReturnValueOnce(existingCheck)
      .mockReturnValueOnce(insertChain);

    await actionNode(
      stateWith([
        classification("m1", "REQUIRES_REPLY"),
        classification("m2", "MEETING"),
      ])
    );

    expect(insertChain.insert).toHaveBeenCalledWith([
      { message_id: "m2", action_type: "ANALYZE_MEETING", status: "PENDING" },
    ]);
  });

  it("throws when the existing-actions lookup fails", async () => {
    supabaseMock.from.mockReturnValueOnce(
      createChain({ data: null, error: { message: "boom" } })
    );

    await expect(
      actionNode(stateWith([classification("m1", "SPAM")]))
    ).rejects.toThrow("Failed to check existing email actions");
  });
});