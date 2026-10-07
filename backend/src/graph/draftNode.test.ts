
import { describe, it, expect, vi, beforeEach } from "vitest";
import { draftNode } from "./nodes";
import type { EmailTriageState } from "./state";
import type { Email } from "../types/email";
import type { EmailAction } from "../types/action";
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

const USER_ID = "user-1";
const GOOGLE_ACCOUNT_ID = "google-account-1";

const email = (id: string): Email => ({
  id,
  threadId: "thread-1",
  from: "sender@example.com",
  to: "me@example.com",
  subject: "Hello",
  body: "Email body",
  receivedAt: "2026-09-17T00:00:00.000Z",
});

const draftAction = (messageId: string): EmailAction => ({
  messageId,
  type: "DRAFT_REPLY",
  status: "PENDING",
});

const stateWith = (emails: Email[], actions: EmailAction[]) =>
  ({
    userId: USER_ID,
    googleAccountId: GOOGLE_ACCOUNT_ID,
    emails,
    actions,
  }) as unknown as EmailTriageState;

const groqReply = (content: string) => ({
  choices: [{ message: { content } }],
});

function mockOwnership() {
  const accountOwnership = createChain({
    data: { id: GOOGLE_ACCOUNT_ID },
    error: null,
  });

  supabaseMock.from.mockReturnValueOnce(accountOwnership);

  return accountOwnership;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("draftNode", () => {
  it("skips draft generation when a draft already exists, but reconciles the action to COMPLETED", async () => {
    mockOwnership();

    const emailLookup = createChain({
      data: [{ id: "uuid-1", message_id: "m1" }],
      error: null,
    });
    const existingDrafts = createChain({
      data: [{ email_id: "uuid-1" }],
      error: null,
    });
    const actionUpdate = createChain({ data: null, error: null });

    supabaseMock.from
      .mockReturnValueOnce(emailLookup)
      .mockReturnValueOnce(existingDrafts)
      .mockReturnValueOnce(actionUpdate);

    const result = await draftNode(
      stateWith([email("m1")], [draftAction("m1")])
    );

    // LLM must never be asked to redraft an existing draft
    expect(groqMock.groq.chat.completions.create).not.toHaveBeenCalled();

    expect(actionUpdate.update).toHaveBeenCalledWith({
      status: "COMPLETED",
    });
    expect(actionUpdate.in).toHaveBeenCalledWith("message_id", ["m1"]);
    expect(actionUpdate.eq).toHaveBeenCalledWith(
      "action_type",
      "DRAFT_REPLY"
    );
    expect(result.actions?.[0].status).toBe("COMPLETED");
  });

  it("generates and persists a new draft, then marks the action COMPLETED", async () => {
    mockOwnership();

    const emailLookup = createChain({
      data: [{ id: "uuid-1", message_id: "m1" }],
      error: null,
    });
    const existingDrafts = createChain({
      data: [],
      error: null,
    });
    const upsertChain = createChain({
      data: null,
      error: null,
    });
    const actionUpdate = createChain({
      data: null,
      error: null,
    });

    supabaseMock.from
      .mockReturnValueOnce(emailLookup)
      .mockReturnValueOnce(existingDrafts)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(actionUpdate);

    groqMock.groq.chat.completions.create.mockResolvedValue(
      groqReply("Hi, thanks for your email. Regards,")
    );

    const result = await draftNode(
      stateWith([email("m1")], [draftAction("m1")])
    );

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      [
        {
          email_id: "uuid-1",
          body: "Hi, thanks for your email. Regards,",
          status: "PENDING_REVIEW",
          kind: "reply",
        },
      ],
      {
        onConflict: "email_id,kind",
        ignoreDuplicates: true,
      }
    );

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts?.[0].draftBody).toBe(
      "Hi, thanks for your email. Regards,"
    );
    expect(result.actions?.[0].status).toBe("COMPLETED");
  });

  it("skips when the email is not present in state (missing lookup)", async () => {
    mockOwnership();

    const emailLookup = createChain({
      data: [{ id: "uuid-1", message_id: "m1" }],
      error: null,
    });
    const existingDrafts = createChain({
      data: [],
      error: null,
    });

    supabaseMock.from
      .mockReturnValueOnce(emailLookup)
      .mockReturnValueOnce(existingDrafts);

    const result = await draftNode(
      stateWith([], [draftAction("m1")])
    );

    expect(groqMock.groq.chat.completions.create).not.toHaveBeenCalled();

    // Account ownership + email lookup + draft lookup.
    expect(supabaseMock.from).toHaveBeenCalledTimes(3);
    expect(result.actions?.[0].status).toBe("PENDING");
  });

  it("does not persist an empty LLM response and leaves the action PENDING", async () => {
    mockOwnership();

    const emailLookup = createChain({
      data: [{ id: "uuid-1", message_id: "m1" }],
      error: null,
    });
    const existingDrafts = createChain({
      data: [],
      error: null,
    });

    supabaseMock.from
      .mockReturnValueOnce(emailLookup)
      .mockReturnValueOnce(existingDrafts);

    groqMock.groq.chat.completions.create.mockResolvedValue(
      groqReply("")
    );

    const result = await draftNode(
      stateWith([email("m1")], [draftAction("m1")])
    );

    expect(supabaseMock.from).toHaveBeenCalledTimes(3);
    expect(result.actions?.[0].status).toBe("PENDING");
  });

  it("rejects draft processing when the Google account does not belong to the user", async () => {
    const accountOwnership = createChain({
      data: null,
      error: null,
    });

    supabaseMock.from.mockReturnValueOnce(accountOwnership);

    await expect(
      draftNode(
        stateWith([email("m1")], [draftAction("m1")])
      )
    ).rejects.toThrow(
      "Google account does not belong to authenticated user"
    );

    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

it("throws when the Google account ownership lookup fails", async () => {
  supabaseMock.from.mockReturnValueOnce(
    createChain({
      data: null,
      error: { message: "account lookup failed" },
    })
  );

  await expect(
    draftNode(
      stateWith([email("m1")], [draftAction("m1")])
    )
  ).rejects.toThrow(
    "Failed to verify Google account ownership: account lookup failed"
  );

  expect(supabaseMock.from).toHaveBeenCalledTimes(1);
});

it("throws when the email ownership lookup fails", async () => {
  mockOwnership();

  supabaseMock.from.mockReturnValueOnce(
    createChain({
      data: null,
      error: { message: "email lookup failed" },
    })
  );

  await expect(
    draftNode(
      stateWith([email("m1")], [draftAction("m1")])
    )
  ).rejects.toThrow(
    "Failed to look up email IDs: email lookup failed"
  );

  expect(supabaseMock.from).toHaveBeenCalledTimes(2);
});
});
