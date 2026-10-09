import { describe, it, expect, vi, beforeEach } from "vitest";
import { listEmails, getEmail } from "./email.controller";
import { createChain } from "../test/mocks/supabase";

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("../config/supabase.js", () => ({ supabase: supabaseMock }));

vi.mock("../services/triage.service.js", () => ({
  runInboxTriage: vi.fn(),
}));

const req = (query: any = {}, userId = "user-1") =>
  ({
    query,
    user: {
      id: userId,
    },
  }) as any;

const reqWithParams = (
  params: any = {},
  query: any = {},
  userId = "user-1"
) =>
  ({
    params,
    query,
    user: {
      id: userId,
    },
  }) as any;

function createRes() {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listEmails", () => {
  it("scopes email queries to the authenticated user's Google account", async () => {
    const accountChain = createChain({
      data: { id: "google-account-1" },
      error: null,
    });

    const emailChain = createChain({
      data: [],
      error: null,
      count: 4,
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    const res = createRes();

    await listEmails(
      req({
        category: "NEEDS_ATTENTION",
        page: "2",
        limit: "10",
      }),
      res
    );

    expect(supabaseMock.from).toHaveBeenNthCalledWith(
      1,
      "google_accounts"
    );

    expect(accountChain.eq).toHaveBeenCalledWith("user_id", "user-1");

    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, "emails");

    expect(emailChain.eq).toHaveBeenCalledWith(
      "google_account_id",
      "google-account-1"
    );

    expect(emailChain.in).toHaveBeenCalledWith("category", [
      "IMPORTANT",
      "REQUIRES_REPLY",
      "MEETING",
    ]);

    expect(emailChain.eq).not.toHaveBeenCalledWith(
      "category",
      expect.anything()
    );

    expect(emailChain.range).toHaveBeenCalledWith(10, 19);

    expect(res.json.mock.calls[0][0].pagination).toEqual({
      page: 2,
      limit: 10,
      total: 4,
      totalPages: 1,
    });
  });

  it("applies a plain category as an exact-match filter", async () => {
    const accountChain = createChain({
      data: { id: "google-account-1" },
      error: null,
    });

    const emailChain = createChain({
      data: [],
      error: null,
      count: 0,
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    const res = createRes();

    await listEmails(req({ category: "SPAM" }), res);

    expect(emailChain.eq).toHaveBeenCalledWith(
      "google_account_id",
      "google-account-1"
    );

    expect(emailChain.eq).toHaveBeenCalledWith("category", "SPAM");
    expect(emailChain.in).not.toHaveBeenCalled();
  });

  it("applies ACTIONABLE filter with actionable categories plus unclassified", async () => {
    const accountChain = createChain({
      data: { id: "google-account-1" },
      error: null,
    });

    const emailChain = createChain({
      data: [],
      error: null,
      count: 0,
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    const res = createRes();

    await listEmails(req({ category: "ACTIONABLE" }), res);

    expect(emailChain.or).toHaveBeenCalledWith(
      "category.in.(IMPORTANT,REQUIRES_REPLY,INFORMATIONAL,MEETING),category.is.null"
    );
    expect(emailChain.in).not.toHaveBeenCalled();
    expect(emailChain.eq).not.toHaveBeenCalledWith(
      "category",
      expect.anything()
    );
  });

  it("defaults to page 1, limit 20", async () => {
    const accountChain = createChain({
      data: { id: "google-account-1" },
      error: null,
    });

    const emailChain = createChain({
      data: [],
      error: null,
      count: 0,
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    const res = createRes();

    await listEmails(req({}), res);

    expect(emailChain.range).toHaveBeenCalledWith(0, 19);
    expect(res.json.mock.calls[0][0].pagination.page).toBe(1);
    expect(res.json.mock.calls[0][0].pagination.limit).toBe(20);
  });

  it("returns an empty result when the user has no connected Google account", async () => {
    const accountChain = createChain({
      data: null,
      error: null,
    });

    supabaseMock.from.mockReturnValueOnce(accountChain);

    const res = createRes();

    await listEmails(req({}), res);

    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      emails: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });

  it("returns 500 when resolving the user's Google account fails", async () => {
    const accountChain = createChain({
      data: null,
      error: { message: "boom" },
    });

    supabaseMock.from.mockReturnValueOnce(accountChain);

    const res = createRes();

    await listEmails(req({}), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Internal server error",
    });
  });

  it("returns 500 when the email query fails", async () => {
    const accountChain = createChain({
      data: { id: "google-account-1" },
      error: null,
    });

    const emailChain = createChain({
      data: null,
      error: { message: "boom" },
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    const res = createRes();

    await listEmails(req({}), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Failed to fetch emails",
    });
  });
});

describe("getEmail", () => {
  it("returns an email belonging to the authenticated user's Google account", async () => {
    const accountChain = createChain({
      data: { id: "google-account-1" },
      error: null,
    });

    const email = {
      id: "email-1",
      message_id: "message-1",
      google_account_id: "google-account-1",
      subject: "Hello",
    };

    const emailChain = createChain({
      data: email,
      error: null,
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    const res = createRes();

    await getEmail(
      reqWithParams({ id: "email-1" }),
      res
    );

    expect(accountChain.eq).toHaveBeenCalledWith("user_id", "user-1");

    expect(emailChain.eq).toHaveBeenCalledWith("id", "email-1");
    expect(emailChain.eq).toHaveBeenCalledWith(
      "google_account_id",
      "google-account-1"
    );

    expect(res.json).toHaveBeenCalledWith({ email });
  });

  it("returns 404 when the email does not belong to the authenticated user", async () => {
    const accountChain = createChain({
      data: { id: "google-account-1" },
      error: null,
    });

    const emailChain = createChain({
      data: null,
      error: {
        code: "PGRST116",
        message: "No rows found",
      },
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    const res = createRes();

    await getEmail(
      reqWithParams({ id: "email-owned-by-someone-else" }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Email not found",
    });
  });

  it("returns 404 when the user has no connected Google account", async () => {
    const accountChain = createChain({
      data: null,
      error: null,
    });

    supabaseMock.from.mockReturnValueOnce(accountChain);

    const res = createRes();

    await getEmail(reqWithParams({ id: "email-1" }), res);

    expect(supabaseMock.from).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Email not found",
    });
  });

  it("returns 500 when resolving the user's Google account fails", async () => {
    const accountChain = createChain({
      data: null,
      error: { message: "boom" },
    });

    supabaseMock.from.mockReturnValueOnce(accountChain);

    const res = createRes();

    await getEmail(reqWithParams({ id: "email-1" }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Internal server error",
    });
  });

  it("returns 500 when fetching the email fails", async () => {
    const accountChain = createChain({
      data: { id: "google-account-1" },
      error: null,
    });

    const emailChain = createChain({
      data: null,
      error: { message: "boom" },
    });

    supabaseMock.from
      .mockReturnValueOnce(accountChain)
      .mockReturnValueOnce(emailChain);

    const res = createRes();

    await getEmail(reqWithParams({ id: "email-1" }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Failed to fetch email",
    });
  });
});

