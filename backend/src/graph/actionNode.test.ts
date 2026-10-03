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

const USER_ID = "user-1";
const GOOGLE_ACCOUNT_ID = "google-account-1";

const stateWith = (c: EmailClassification[]) =>
  ({
    userId: USER_ID,
    googleAccountId: GOOGLE_ACCOUNT_ID,
    classification: c,
  }) as unknown as EmailTriageState;

const UPSERT_OPTS = {
  onConflict: "message_id,action_type",
  ignoreDuplicates: true,
};

function mockOwnershipAndAction(
  ownedMessageIds: string[],
  actionResult: {
    data: { message_id: string }[] | null;
    error: { message: string } | null;
  }
) {
  const accountChain = createChain({
    data: { id: GOOGLE_ACCOUNT_ID },
    error: null,
  });

  const emailChain = createChain({
    data: ownedMessageIds.map((message_id) => ({ message_id })),
    error: null,
  });

  const actionChain = createChain(actionResult);

  supabaseMock.from
    .mockReturnValueOnce(accountChain)
    .mockReturnValueOnce(emailChain)
    .mockReturnValueOnce(actionChain);

  return {
    accountChain,
    emailChain,
    actionChain,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("actionNode", () => {
  it("upserts new actions with mapped statuses", async () => {
    const { actionChain } = mockOwnershipAndAction(
      ["m1", "m2"],
      {
        data: [{ message_id: "m1" }, { message_id: "m2" }],
        error: null,
      }
    );

    const result = await actionNode(
      stateWith([
        classification("m1", "SPAM"),
        classification("m2", "REQUIRES_REPLY"),
      ])
    );

    expect(supabaseMock.from).toHaveBeenCalledTimes(3);

    expect(supabaseMock.from).toHaveBeenNthCalledWith(
      1,
      "google_accounts"
    );
    expect(supabaseMock.from).toHaveBeenNthCalledWith(
      2,
      "emails"
    );
    expect(supabaseMock.from).toHaveBeenNthCalledWith(
      3,
      "email_actions"
    );

    expect(actionChain.upsert).toHaveBeenCalledWith(
      [
        {
          message_id: "m1",
          action_type: "STORE",
          status: "COMPLETED",
        },
        {
          message_id: "m2",
          action_type: "DRAFT_REPLY",
          status: "PENDING",
        },
      ],
      UPSERT_OPTS
    );

    expect(result.actions).toHaveLength(2);
  });

  it("deduplicates identical actions within a single run", async () => {
    const { actionChain } = mockOwnershipAndAction(
      ["m1"],
      {
        data: [{ message_id: "m1" }],
        error: null,
      }
    );

    await actionNode(
      stateWith([
        classification("m1", "REQUIRES_REPLY"),
        classification("m1", "REQUIRES_REPLY"),
      ])
    );

    expect(actionChain.upsert).toHaveBeenCalledTimes(1);
    expect(actionChain.upsert).toHaveBeenCalledWith(
      [
        {
          message_id: "m1",
          action_type: "DRAFT_REPLY",
          status: "PENDING",
        },
      ],
      UPSERT_OPTS
    );
  });

  it("does not throw when every row already existed (conflict → no rows returned)", async () => {
    const { actionChain } = mockOwnershipAndAction(
      ["m1"],
      {
        data: [],
        error: null,
      }
    );

    const result = await actionNode(
      stateWith([classification("m1", "REQUIRES_REPLY")])
    );

    expect(actionChain.upsert).toHaveBeenCalledTimes(1);
    expect(result.actions).toHaveLength(1);
  });

  it("makes no database call when there are no classifications", async () => {
    const result = await actionNode(stateWith([]));

    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(result.actions).toEqual([]);
  });

  it("rejects action persistence when the Google account does not belong to the user", async () => {
    const accountChain = createChain({
      data: null,
      error: null,
    });

    supabaseMock.from.mockReturnValueOnce(accountChain);

    await expect(
      actionNode(stateWith([classification("m1", "SPAM")]))
    ).rejects.toThrow(
      "Google account does not belong to authenticated user"
    );

    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith(
      "google_accounts"
    );
  });

  it("rejects actions for emails outside the authenticated Google account", async () => {
    const accountChain = createChain({
      data: { id: GOOGLE_ACCOUNT_ID },
      error: null,
    });

    const emailChain = createChain({
      data: [],
      error: null,
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    await expect(
      actionNode(stateWith([classification("m1", "SPAM")]))
    ).rejects.toThrow(
      "Cannot persist actions for emails outside the authenticated Google account: m1"
    );

    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
  });

  it("throws when the account ownership lookup fails", async () => {
    supabaseMock.from.mockReturnValueOnce(
      createChain({
        data: null,
        error: { message: "account lookup failed" },
      })
    );

    await expect(
      actionNode(stateWith([classification("m1", "SPAM")]))
    ).rejects.toThrow(
      "Failed to verify Google account ownership: account lookup failed"
    );

    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it("throws when the email ownership lookup fails", async () => {
    const accountChain = createChain({
      data: { id: GOOGLE_ACCOUNT_ID },
      error: null,
    });

    const emailChain = createChain({
      data: null,
      error: { message: "email lookup failed" },
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    await expect(
      actionNode(stateWith([classification("m1", "SPAM")]))
    ).rejects.toThrow(
      "Failed to verify email ownership for actions: email lookup failed"
    );

    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
  });

  it("throws when the action upsert fails", async () => {
    mockOwnershipAndAction(
      ["m1"],
      {
        data: null,
        error: { message: "boom" },
      }
    );

    await expect(
      actionNode(stateWith([classification("m1", "SPAM")]))
    ).rejects.toThrow("Failed to persist email actions: boom");
  });
});