import { describe, it, expect, vi, beforeEach } from "vitest";
import { actionNode } from "./nodes";
import type { EmailTriageState } from "./state";
import type { EmailClassification } from "../types/classification";
import { createChain } from "../test/mocks/supabase";

const { supabaseMock, groqMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
  groqMock: { groq: { chat: { completions: { create: vi.fn() } } } },
}));

vi.mock("../config/supabase", () => ({ supabase: supabaseMock }));
vi.mock("../config/groq", () => ({ groq: groqMock.groq }));
vi.mock("../services/gmail.service", () => ({
  getMessage: vi.fn(),
  listMessagePage: vi.fn(),
  listAllMessages: vi.fn(),
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

const stateWith = (c: EmailClassification[]) =>
  ({ classification: c }) as unknown as EmailTriageState;

const UPSERT_OPTS = { onConflict: "message_id,action_type", ignoreDuplicates: true };

beforeEach(() => vi.clearAllMocks());

describe("actionNode", () => {
  it("upserts new actions with mapped statuses", async () => {
    const chain = createChain({
      data: [{ message_id: "m1" }, { message_id: "m2" }],
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(chain);

    const result = await actionNode(
      stateWith([classification("m1", "SPAM"), classification("m2", "REQUIRES_REPLY")])
    );

    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith("email_actions");
    expect(chain.upsert).toHaveBeenCalledWith(
      [
        { message_id: "m1", action_type: "STORE", status: "COMPLETED" },
        { message_id: "m2", action_type: "DRAFT_REPLY", status: "PENDING" },
      ],
      UPSERT_OPTS
    );
    expect(result.actions).toHaveLength(2);
  });

  it("deduplicates identical actions within a single run", async () => {
    const chain = createChain({ data: [{ message_id: "m1" }], error: null });
    supabaseMock.from.mockReturnValueOnce(chain);

    await actionNode(
      stateWith([classification("m1", "REQUIRES_REPLY"), classification("m1", "REQUIRES_REPLY")])
    );

    expect(chain.upsert).toHaveBeenCalledTimes(1);
    expect(chain.upsert).toHaveBeenCalledWith(
      [{ message_id: "m1", action_type: "DRAFT_REPLY", status: "PENDING" }],
      UPSERT_OPTS
    );
  });

  it("does not throw when every row already existed (conflict → no rows returned)", async () => {
    supabaseMock.from.mockReturnValueOnce(createChain({ data: [], error: null }));

    const result = await actionNode(stateWith([classification("m1", "REQUIRES_REPLY")]));

    expect(result.actions).toHaveLength(1);
  });

  it("makes no database call when there are no classifications", async () => {
    const result = await actionNode(stateWith([]));

    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(result.actions).toEqual([]);
  });

  it("throws when the upsert fails", async () => {
    supabaseMock.from.mockReturnValueOnce(
      createChain({ data: null, error: { message: "boom" } })
    );

    await expect(
      actionNode(stateWith([classification("m1", "SPAM")]))
    ).rejects.toThrow("Failed to persist email actions: boom");
  });
});