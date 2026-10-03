import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAuth } from "./auth.middleware.js";

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock("../config/supabase.js", () => ({
  supabase: supabaseMock,
}));

function createReq(authorization?: string, body?: any) {
  return {
    headers: authorization ? { authorization } : {},
    body,
  } as any;
}

function createRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function createNext() {
  return vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", async () => {
    const req = createReq();
    const res = createRes();
    const next = createNext();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Missing Authorization header",
    });
    expect(next).not.toHaveBeenCalled();
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it.each([
    "Basic abc123",
    "Bearer",
    "Bearer ",
    "Token abc123",
    "Bearer abc def",
  ])("rejects a malformed Authorization header: %s", async (authorization) => {
    const req = createReq(authorization);
    const res = createRes();
    const next = createNext();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid Authorization header",
    });
    expect(next).not.toHaveBeenCalled();
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects a request when Supabase token verification fails", async () => {
    supabaseMock.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });

    const req = createReq("Bearer invalid-token");
    const res = createRes();
    const next = createNext();

    await requireAuth(req, res, next);

    expect(supabaseMock.auth.getUser).toHaveBeenCalledWith("invalid-token");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid or expired token",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a valid token and exposes the verified user ID on the request", async () => {
    supabaseMock.auth.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "auth-user-123",
        },
      },
      error: null,
    });

    const req = createReq("Bearer valid-access-token");
    const res = createRes();
    const next = createNext();

    await requireAuth(req, res, next);

    expect(supabaseMock.auth.getUser).toHaveBeenCalledWith(
      "valid-access-token"
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({
      id: "auth-user-123",
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("uses the verified Supabase user ID instead of a client-provided user ID", async () => {
    supabaseMock.auth.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "verified-user-123",
        },
      },
      error: null,
    });

    const req = createReq("Bearer valid-access-token", {
      userId: "attacker-controlled-user-456",
    });
    const res = createRes();
    const next = createNext();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({
      id: "verified-user-123",
    });
    expect(req.user.id).not.toBe(req.body.userId);
  });
});