//draft.controller.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateDraft,
  approveDraft,
  rejectDraft,
  sendDraft,
  resolveSend,
} from "./draft.controller";
import { createFakeSupabase } from "../test/mocks/fakeSupabase.js";

const { supabaseMock, gmailMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
  gmailMock: {
    getMessage: vi.fn(),
    sendReply: vi.fn(),
  },
}));

// Specifiers must match what draft.controller.ts itself imports ("...js").
vi.mock("../config/supabase.js", () => ({ supabase: supabaseMock }));
vi.mock("../services/gmail.service.js", () => ({
  getMessage: gmailMock.getMessage,
  sendReply: gmailMock.sendReply,
}));

const req = (params: any = {}, body?: any) => ({ params, body }) as any;

function createRes() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

const statusOf = (r: any) => r.status.mock.calls[0]?.[0] ?? 200;
const bodyOf = (r: any) => r.json.mock.calls[0]?.[0];

const OLD = "2026-01-01T00:00:00.000Z";

function setup(draftStatus: string, overrides: Record<string, any> = {}) {
  const fake = createFakeSupabase({
    drafts: [
      {
        id: "d1",
        email_id: "e1",
        body: "Draft body",
        status: draftStatus,
        created_at: OLD,
        updated_at: OLD,
        ...overrides,
      },
    ],
    emails: [
      {
        id: "e1",
        thread_id: "t1",
        message_id: "gmail-m1",
        from_email: "sender@example.com",
        to_email: "me@example.com",
        subject: "Hello",
      },
    ],
    google_accounts: [{ email: "me@example.com", refresh_token: "rt" }],
  });
  supabaseMock.from.mockImplementation(fake.from);
  return fake;
}

const draftStatusIn = (fake: ReturnType<typeof setup>) =>
  fake.tables.drafts[0].status;

beforeEach(() => {
  vi.resetAllMocks();
  gmailMock.getMessage.mockResolvedValue({
    payload: { headers: [{ name: "Message-ID", value: "<rfc@id>" }] },
  });
  gmailMock.sendReply.mockResolvedValue(undefined);
});

describe("updateDraft", () => {
  it("saves new text on a PENDING_REVIEW draft", async () => {
    const fake = setup("PENDING_REVIEW");

    const res = createRes();
    await updateDraft(req({ emailId: "e1" }, { body: "  Edited reply  " }), res);

    expect(statusOf(res)).toBe(200);
    expect(bodyOf(res).draft.body).toBe("Edited reply");
    expect(fake.tables.drafts[0].body).toBe("Edited reply");
    expect(draftStatusIn(fake)).toBe("PENDING_REVIEW");
  });

  it.each(["APPROVED", "SENDING", "SENT", "REJECTED"])(
    "refuses to edit a %s draft and leaves the text alone",
    async (status) => {
      const fake = setup(status);

      const res = createRes();
      await updateDraft(req({ emailId: "e1" }, { body: "Sneaky edit" }), res);

      expect(statusOf(res)).toBe(400);
      expect(bodyOf(res).message).toMatch(/Cannot edit/);
      expect(fake.tables.drafts[0].body).toBe("Draft body");
    }
  );

  it("rejects an empty or missing body", async () => {
    const fake = setup("PENDING_REVIEW");

    for (const body of [{ body: "   " }, {}, undefined, { body: 42 }]) {
      const res = createRes();
      await updateDraft(req({ emailId: "e1" }, body), res);
      expect(statusOf(res)).toBe(400);
    }
    expect(fake.tables.drafts[0].body).toBe("Draft body");
  });

  it("rejects an over-long body", async () => {
    setup("PENDING_REVIEW");

    const res = createRes();
    await updateDraft(req({ emailId: "e1" }, { body: "x".repeat(20_001) }), res);

    expect(statusOf(res)).toBe(400);
  });

  it("returns 404 when the draft does not exist", async () => {
    setup("PENDING_REVIEW");

    const res = createRes();
    await updateDraft(req({ emailId: "nope" }, { body: "Hi" }), res);

    expect(statusOf(res)).toBe(404);
  });
});

describe("approveDraft", () => {
  it("approves a PENDING_REVIEW draft", async () => {
    const fake = setup("PENDING_REVIEW");

    const res = createRes();
    await approveDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(200);
    expect(bodyOf(res).draft.status).toBe("APPROVED");
    expect(draftStatusIn(fake)).toBe("APPROVED");
  });

  it("approves the saved (edited) text", async () => {
    setup("PENDING_REVIEW");

    await updateDraft(req({ emailId: "e1" }, { body: "Edited reply" }), createRes());
    const res = createRes();
    await approveDraft(req({ emailId: "e1" }), res);

    expect(bodyOf(res).draft.body).toBe("Edited reply");
  });

  it("refuses to approve a non-pending draft", async () => {
    setup("SENT");

    const res = createRes();
    await approveDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(400);
    expect(bodyOf(res).message).toMatch(/Cannot approve/);
  });

  it("returns 404 when the draft does not exist", async () => {
    setup("PENDING_REVIEW");

    const res = createRes();
    await approveDraft(req({ emailId: "nope" }), res);

    expect(statusOf(res)).toBe(404);
  });

  it("lets only one of two concurrent approvals win", async () => {
    setup("PENDING_REVIEW");

    const [a, b] = [createRes(), createRes()];
    await Promise.all([
      approveDraft(req({ emailId: "e1" }), a),
      approveDraft(req({ emailId: "e1" }), b),
    ]);

    expect([statusOf(a), statusOf(b)].sort()).toEqual([200, 400]);
  });

  it("cannot approve and reject the same draft concurrently", async () => {
    const fake = setup("PENDING_REVIEW");

    const [a, b] = [createRes(), createRes()];
    await Promise.all([
      approveDraft(req({ emailId: "e1" }), a),
      rejectDraft(req({ emailId: "e1" }), b),
    ]);

    expect([statusOf(a), statusOf(b)].sort()).toEqual([200, 400]);
    expect(["APPROVED", "REJECTED"]).toContain(draftStatusIn(fake));
  });
});

describe("rejectDraft", () => {
  it("rejects a PENDING_REVIEW draft", async () => {
    const fake = setup("PENDING_REVIEW");

    const res = createRes();
    await rejectDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(200);
    expect(draftStatusIn(fake)).toBe("REJECTED");
  });

  it("refuses to reject a non-pending draft", async () => {
    setup("APPROVED");

    const res = createRes();
    await rejectDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(400);
    expect(bodyOf(res).message).toMatch(/Cannot reject/);
  });
});

describe("sendDraft — approval gate", () => {
  it("NEVER sends an unapproved draft", async () => {
    setup("PENDING_REVIEW");

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(400);
    expect(bodyOf(res).message).toMatch(/must be APPROVED/);
    expect(gmailMock.sendReply).not.toHaveBeenCalled();
  });

  it("refuses an already-sent draft", async () => {
    setup("SENT");

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(400);
    expect(bodyOf(res).message).toBe("Draft already sent");
    expect(gmailMock.sendReply).not.toHaveBeenCalled();
  });

  it("returns 404 when the draft does not exist", async () => {
    setup("APPROVED");

    const res = createRes();
    await sendDraft(req({ emailId: "nope" }), res);

    expect(statusOf(res)).toBe(404);
  });

  it("sends an APPROVED draft and marks it SENT", async () => {
    const fake = setup("APPROVED");

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(200);
    expect(gmailMock.sendReply).toHaveBeenCalledTimes(1);
    expect(gmailMock.sendReply).toHaveBeenCalledWith(
      "rt",
      expect.objectContaining({
        to: "sender@example.com",
        from: "me@example.com",
        body: "Draft body",
        threadId: "t1",
        inReplyTo: "<rfc@id>",
        references: "<rfc@id>",
      })
    );
    expect(bodyOf(res).draft.status).toBe("SENT");
    expect(draftStatusIn(fake)).toBe("SENT");
  });
});

describe("sendDraft — concurrency", () => {
  it("sends exactly once when two requests race", async () => {
    const fake = setup("APPROVED");

    let finishSend!: () => void;
    gmailMock.sendReply.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSend = resolve;
      })
    );

    const [a, b] = [createRes(), createRes()];
    const first = sendDraft(req({ emailId: "e1" }), a);
    const second = sendDraft(req({ emailId: "e1" }), b);

    // The loser is refused while the winner's Gmail call is still in flight.
    await second;
    expect(statusOf(b)).toBe(409);
    expect(bodyOf(b).message).toMatch(/already being sent/);
    expect(draftStatusIn(fake)).toBe("SENDING");

    // Let the winner's Gmail call finish.
    await vi.waitFor(() => expect(gmailMock.sendReply).toHaveBeenCalled());
    finishSend();
    await first;

    expect(statusOf(a)).toBe(200);
    expect(gmailMock.sendReply).toHaveBeenCalledTimes(1);
    expect(draftStatusIn(fake)).toBe("SENT");
  });

  it("sends exactly once across many simultaneous requests", async () => {
    setup("APPROVED");

    const responses = Array.from({ length: 5 }, () => createRes());
    await Promise.all(
      responses.map((res) => sendDraft(req({ emailId: "e1" }), res))
    );

    expect(gmailMock.sendReply).toHaveBeenCalledTimes(1);
    expect(responses.filter((r) => statusOf(r) === 200)).toHaveLength(1);
  });

  it("sends the text that was approved even if an edit arrives mid-send", async () => {
    const fake = setup("APPROVED");

    let finishSend!: () => void;
    gmailMock.sendReply.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSend = resolve;
      })
    );

    const sendRes = createRes();
    const sending = sendDraft(req({ emailId: "e1" }), sendRes);

    const editRes = createRes();
    await updateDraft(req({ emailId: "e1" }, { body: "Too late" }), editRes);
    expect(statusOf(editRes)).toBe(400);

    await vi.waitFor(() => expect(gmailMock.sendReply).toHaveBeenCalled());
    finishSend();
    await sending;

    expect(gmailMock.sendReply).toHaveBeenCalledWith(
      "rt",
      expect.objectContaining({ body: "Draft body" })
    );
    expect(fake.tables.drafts[0].body).toBe("Draft body");
  });
});

describe("sendDraft — failures", () => {
  it("releases the claim when setup fails before anything is sent", async () => {
    const fake = setup("APPROVED");
    gmailMock.getMessage.mockRejectedValue(new Error("lookup failed"));

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(500);
    expect(gmailMock.sendReply).not.toHaveBeenCalled();
    expect(draftStatusIn(fake)).toBe("APPROVED");
  });

  it("releases the claim when the original email is missing", async () => {
    const fake = setup("APPROVED");
    fake.tables.emails.length = 0;

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(404);
    expect(draftStatusIn(fake)).toBe("APPROVED");
  });

  it("releases the claim when Gmail definitely rejects the send (4xx)", async () => {
    const fake = setup("APPROVED");
    gmailMock.sendReply.mockRejectedValue(
      Object.assign(new Error("Invalid recipient"), { response: { status: 400 } })
    );

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(statusOf(res)).toBe(500);
    expect(bodyOf(res).message).toBe("Failed to send reply");
    expect(draftStatusIn(fake)).toBe("APPROVED");
  });

  it.each([
    ["a 503 from Gmail", Object.assign(new Error("unavailable"), { response: { status: 503 } })],
    ["a connection reset", Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })],
    ["an unknown error", new Error("Gmail down")],
  ])(
    "marks the draft SEND_UNCERTAIN (not SENT, not resendable) on %s",
    async (_label, failure) => {
      const fake = setup("APPROVED");
      gmailMock.sendReply.mockRejectedValue(failure);

      const res = createRes();
      await sendDraft(req({ emailId: "e1" }), res);

      expect(statusOf(res)).toBe(502);
      expect(bodyOf(res).message).toMatch(/Check your Sent folder/);
      expect(draftStatusIn(fake)).toBe("SEND_UNCERTAIN");

      // A retry is refused, so there is no automatic resend.
      gmailMock.sendReply.mockClear();
      const retry = createRes();
      await sendDraft(req({ emailId: "e1" }), retry);
      expect(statusOf(retry)).toBe(409);
      expect(gmailMock.sendReply).not.toHaveBeenCalled();
    }
  );

  it("keeps the draft un-resendable when Gmail succeeded but the SENT write failed", async () => {
    const fake = setup("APPROVED");
    const realFrom = supabaseMock.from.getMockImplementation()!;
    let drafts = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      // Fail the second drafts update (SENDING -> SENT); the first is the claim.
      if (table === "drafts") {
        drafts += 1;
        if (drafts === 2) fake.failNext("drafts", "update", "db down");
      }
      return realFrom(table);
    });

    const res = createRes();
    await sendDraft(req({ emailId: "e1" }), res);

    expect(gmailMock.sendReply).toHaveBeenCalledTimes(1);
    expect(statusOf(res)).toBe(500);
    expect(bodyOf(res).message).toBe("Reply sent but failed to update draft status");
    expect(draftStatusIn(fake)).toBe("SENDING");
  });
});

describe("resolveSend", () => {
  it("marks an uncertain draft as SENT", async () => {
    const fake = setup("SEND_UNCERTAIN");

    const res = createRes();
    await resolveSend(req({ emailId: "e1" }, { outcome: "SENT" }), res);

    expect(statusOf(res)).toBe(200);
    expect(draftStatusIn(fake)).toBe("SENT");
  });

  it("returns an uncertain draft to APPROVED when it was not sent", async () => {
    const fake = setup("SEND_UNCERTAIN");

    const res = createRes();
    await resolveSend(req({ emailId: "e1" }, { outcome: "NOT_SENT" }), res);

    expect(statusOf(res)).toBe(200);
    expect(draftStatusIn(fake)).toBe("APPROVED");
  });

  it("resolves a SENDING draft that has been stuck for a long time", async () => {
    const fake = setup("SENDING", { updated_at: OLD });

    const res = createRes();
    await resolveSend(req({ emailId: "e1" }, { outcome: "NOT_SENT" }), res);

    expect(statusOf(res)).toBe(200);
    expect(draftStatusIn(fake)).toBe("APPROVED");
  });

  it("does not touch a SENDING draft that is still in flight", async () => {
    const fake = setup("SENDING", { updated_at: new Date().toISOString() });

    const res = createRes();
    await resolveSend(req({ emailId: "e1" }, { outcome: "NOT_SENT" }), res);

    expect(statusOf(res)).toBe(400);
    expect(draftStatusIn(fake)).toBe("SENDING");
  });

  it.each(["APPROVED", "PENDING_REVIEW", "SENT"])(
    "refuses to resolve a %s draft",
    async (status) => {
      const fake = setup(status);

      const res = createRes();
      await resolveSend(req({ emailId: "e1" }, { outcome: "NOT_SENT" }), res);

      expect(statusOf(res)).toBe(400);
      expect(draftStatusIn(fake)).toBe(status);
    }
  );

  it("rejects an invalid outcome", async () => {
    setup("SEND_UNCERTAIN");

    const res = createRes();
    await resolveSend(req({ emailId: "e1" }, { outcome: "MAYBE" }), res);

    expect(statusOf(res)).toBe(400);
  });
});
