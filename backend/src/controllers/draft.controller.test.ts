import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  approveDraft,
  rejectDraft,
  sendDraft,
} from "./draft.controller";
import { createChain } from "../test/mocks/supabase";

const { supabaseMock, gmailMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
  gmailMock: {
    getMessage: vi.fn(),
    sendReply: vi.fn(),
    listMessages: vi.fn(),
  },
}));

// Specifiers must match what draft.controller.ts itself imports ("...js").
vi.mock("../config/supabase.js", () => ({ supabase: supabaseMock }));
vi.mock("../services/gmail.service.js", () => ({
  getMessage: gmailMock.getMessage,
  sendReply: gmailMock.sendReply,
}));

const req = (params: any = {}) => ({ params }) as any;

function createRes() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

const statusOf = (r: any) => r.status.mock.calls[0]?.[0];
const bodyOf = (r: any) => r.json.mock.calls[0]?.[0];

const draftRow = (status: string) => ({
  id: "d1",
  email_id: "e1",
  body: "Draft body",
  status,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("approveDraft", () => {
  it("approves a PENDING_REVIEW draft", async () => {
    const fetchChain = createChain({
      data: { status: "PENDING_REVIEW" },
      error: null,
    });
    const updateChain = createChain({ data: draftRow("APPROVED"), error: null });
    supabaseMock.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(updateChain);

    const res = createRes();
    await approveDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(200);
    expect(bodyOf(res).draft.status).toBe("APPROVED");
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "APPROVED" })
    );
  });

  it("refuses to approve a non-pending draft", async () => {
    supabaseMock.from.mockReturnValueOnce(
      createChain({ data: { status: "SENT" }, error: null })
    );

    const res = createRes();
    await approveDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(400);
    expect(bodyOf(res).message).toMatch(/Cannot approve/);
  });

  it("returns 404 when the draft does not exist", async () => {
    supabaseMock.from.mockReturnValueOnce(
      createChain({ data: null, error: { code: "PGRST116", message: "none" } })
    );

    const res = createRes();
    await approveDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(404);
  });
});

describe("rejectDraft", () => {
  it("refuses to reject a non-pending draft", async () => {
    supabaseMock.from.mockReturnValueOnce(
      createChain({ data: { status: "APPROVED" }, error: null })
    );

    const res = createRes();
    await rejectDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(400);
    expect(bodyOf(res).message).toMatch(/Cannot reject/);
  });
});

describe("sendDraft — approval gate", () => {
  // Chains in the exact order sendDraft queries them:
  // 1 drafts, 2 emails, 3 google_accounts, 4 update-to-SENT
  function mockSendFlow(draftStatus: string) {
    const chains = {
      draft: createChain({ data: draftRow(draftStatus), error: null }),
      email: createChain({
        data: {
          id: "e1",
          thread_id: "t1",
          message_id: "gmail-m1",
          from_email: "sender@example.com",
          to_email: "me@example.com",
          subject: "Hello",
        },
        error: null,
      }),
      account: createChain({
        data: { email: "me@example.com", refresh_token: "rt" },
        error: null,
      }),
      update: createChain({ data: draftRow("SENT"), error: null }),
    };
    supabaseMock.from
      .mockReturnValueOnce(chains.draft)
      .mockReturnValueOnce(chains.email)
      .mockReturnValueOnce(chains.account)
      .mockReturnValueOnce(chains.update);
    return chains;
  }

  it("NEVER sends an unapproved draft", async () => {
    mockSendFlow("PENDING_REVIEW");

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(400);
    expect(bodyOf(res).message).toMatch(/must be APPROVED/);
    expect(gmailMock.sendReply).not.toHaveBeenCalled();
  });

  it("sends an APPROVED draft and marks it SENT", async () => {
    mockSendFlow("APPROVED");
    gmailMock.getMessage.mockResolvedValue({
      payload: { headers: [{ name: "Message-ID", value: "<rfc@id>" }] },
    });
    gmailMock.sendReply.mockResolvedValue(undefined);

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(200);
    expect(gmailMock.sendReply).toHaveBeenCalledTimes(1);
    expect(gmailMock.sendReply).toHaveBeenCalledWith(
      "rt",
      expect.objectContaining({
        to: "sender@example.com",
        from: "me@example.com",
        threadId: "t1",
        inReplyTo: "<rfc@id>",
        references: "<rfc@id>",
      })
    );
    expect(bodyOf(res).draft.status).toBe("SENT");
  });

  it("does NOT mark the draft SENT when Gmail fails", async () => {
    const chains = mockSendFlow("APPROVED");
    gmailMock.getMessage.mockResolvedValue({ payload: { headers: [] } });
    gmailMock.sendReply.mockRejectedValue(new Error("Gmail down"));

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(500);
    expect(bodyOf(res).message).toBe("Failed to send reply");
    // The update-to-SENT chain must never have been queried
    expect(chains.update.update).not.toHaveBeenCalled();
  });
});