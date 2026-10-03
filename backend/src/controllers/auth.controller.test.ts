import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseMock, oauth2ClientMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
  oauth2ClientMock: {
    generateAuthUrl: vi.fn(),
    getToken: vi.fn(),
    setCredentials: vi.fn(),
    refreshAccessToken: vi.fn(),
  },
}));

vi.mock("../config/supabase.js", () => ({
  supabase: supabaseMock,
}));

vi.mock("../config/google.js", () => ({
  oauth2Client: oauth2ClientMock,
}));

vi.mock("../config/googleScopes.js", () => ({
  GOOGLE_SCOPES: ["scope-a", "scope-b"],
}));

import {
  googleAuth,
  googleCallback,
} from "./auth.controller.js";

function createReq(
  options: {
    userId?: string;
    query?: Record<string, unknown>;
  } = {}
) {
  return {
    user: options.userId ? { id: options.userId } : undefined,
    query: options.query ?? {},
  } as any;
}

function createRes() {
  const res: any = {};

  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.redirect = vi.fn(() => res);

  return res;
}

function createGoogleAccountUpsertChain(result: {
  data?: any;
  error?: any;
}) {
  return {
    upsert: vi.fn(() => Promise.resolve(result)),
  };
}

function createValidOAuthState(userId: string) {
  oauth2ClientMock.generateAuthUrl.mockImplementation(
    (options: Record<string, unknown>) => {
      return `https://accounts.google.com/o/oauth2/auth?state=${encodeURIComponent(
        String(options.state)
      )}`;
    }
  );

  const req = createReq({ userId });
  const res = createRes();

  return googleAuth(req, res).then(() => {
    const authUrl = oauth2ClientMock.generateAuthUrl.mock.calls[0][0];
    return authUrl.state as string;
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  process.env.SUPABASE_SECRET_KEY = "test-secret-key";
});

describe("googleAuth", () => {
  it("rejects unauthenticated requests", async () => {
    const req = createReq();
    const res = createRes();

    await googleAuth(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Authentication required",
    });
    expect(oauth2ClientMock.generateAuthUrl).not.toHaveBeenCalled();
  });

it("generates a Google OAuth URL containing a signed state for the authenticated user", async () => {
  oauth2ClientMock.generateAuthUrl.mockReturnValue(
    "https://accounts.google.com/o/oauth2/auth"
  );

  const req = createReq({
    userId: "auth-user-123",
  });
  const res = createRes();

  await googleAuth(req, res);

  expect(oauth2ClientMock.generateAuthUrl).toHaveBeenCalledTimes(1);

  const options =
    oauth2ClientMock.generateAuthUrl.mock.calls[0][0];

  expect(options.access_type).toBe("offline");
  expect(options.prompt).toBe("consent");
  expect(options.scope).toEqual(["scope-a", "scope-b"]);
  expect(typeof options.state).toBe("string");
  expect(options.state).toContain(".");

  expect(res.redirect).toHaveBeenCalledTimes(1);
  expect(res.redirect).toHaveBeenCalledWith(
    "https://accounts.google.com/o/oauth2/auth"
  );
});

  it("uses the authenticated user ID when generating OAuth state", async () => {
    const firstReq = createReq({
      userId: "user-one",
    });
    const firstRes = createRes();

    await googleAuth(firstReq, firstRes);

    const firstState =
      oauth2ClientMock.generateAuthUrl.mock.calls[0][0].state;

    vi.clearAllMocks();

    const secondReq = createReq({
      userId: "user-two",
    });
    const secondRes = createRes();

    await googleAuth(secondReq, secondRes);

    const secondState =
      oauth2ClientMock.generateAuthUrl.mock.calls[0][0].state;

    expect(firstState).not.toBe(secondState);
  });
});

describe("googleCallback", () => {
  it("rejects a callback without an authorization code", async () => {
    const req = createReq({
      query: {},
    });
    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Authorization code missing",
    });
    expect(oauth2ClientMock.getToken).not.toHaveBeenCalled();
  });

  it("rejects a callback without OAuth state", async () => {
    const req = createReq({
      query: {
        code: "google-code",
      },
    });
    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "OAuth state missing",
    });
    expect(oauth2ClientMock.getToken).not.toHaveBeenCalled();
  });

  it("rejects a tampered OAuth state", async () => {
    const state = await createValidOAuthState("auth-user-123");

    vi.clearAllMocks();

    const tamperedState = `${state.slice(0, -1)}x`;

    const req = createReq({
      query: {
        code: "google-code",
        state: tamperedState,
      },
    });
    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid or expired OAuth state",
    });
    expect(oauth2ClientMock.getToken).not.toHaveBeenCalled();
  });

  it("stores the Google account with the authenticated Supabase user ID", async () => {
    const userId = "auth-user-123";
    const state = await createValidOAuthState(userId);

    vi.clearAllMocks();

    oauth2ClientMock.getToken.mockResolvedValueOnce({
      tokens: {
        access_token: "google-access-token",
        refresh_token: "google-refresh-token",
        token_type: "Bearer",
        scope: "scope-a scope-b",
        expiry_date: Date.now() + 3600000,
      },
    });

    const upsertMock = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: null,
      })
    );

    supabaseMock.from.mockReturnValue({
      upsert: upsertMock,
    });

    const originalFetch = globalThis.fetch;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          email: "connected@gmail.com",
        }),
      })
    );

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
    });
    const res = createRes();

    await googleCallback(req, res);

    expect(oauth2ClientMock.getToken).toHaveBeenCalledWith(
      "google-code"
    );

    expect(oauth2ClientMock.setCredentials).toHaveBeenCalledWith({
      access_token: "google-access-token",
      refresh_token: "google-refresh-token",
      token_type: "Bearer",
      scope: "scope-a scope-b",
      expiry_date: expect.any(Number),
    });

    expect(supabaseMock.from).toHaveBeenCalledWith(
      "google_accounts"
    );

    expect(upsertMock).toHaveBeenCalledWith(
      {
        email: "connected@gmail.com",
        user_id: userId,
        refresh_token: "google-refresh-token",
        updated_at: expect.any(String),
      },
      {
        onConflict: "email",
      }
    );

    expect(res.json).toHaveBeenCalledWith({
      message: "Google OAuth successful",
      email: "connected@gmail.com",
      refreshTokenStored: true,
    });

    vi.stubGlobal("fetch", originalFetch);
  });

  it("does not trust a client-provided user ID when saving the account", async () => {
    const authenticatedUserId = "verified-user-123";
    const state = await createValidOAuthState(authenticatedUserId);

    vi.clearAllMocks();

    oauth2ClientMock.getToken.mockResolvedValueOnce({
      tokens: {
        access_token: "google-access-token",
        refresh_token: "google-refresh-token",
      },
    });

    const upsertMock = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: null,
      })
    );

    supabaseMock.from.mockReturnValue({
      upsert: upsertMock,
    });

    const originalFetch = globalThis.fetch;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          email: "connected@gmail.com",
        }),
      })
    );

    const req = {
      user: {
        id: "attacker-controlled-user",
      },
      query: {
        code: "google-code",
        state,
      },
      body: {
        userId: "attacker-controlled-user",
      },
    } as any;

    const res = createRes();

    await googleCallback(req, res);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: authenticatedUserId,
      }),
      {
        onConflict: "email",
      }
    );

    expect(upsertMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "attacker-controlled-user",
      }),
      expect.anything()
    );

    vi.stubGlobal("fetch", originalFetch);
  });

  it("rejects the callback when Google does not return an access token", async () => {
    const state = await createValidOAuthState("auth-user-123");

    vi.clearAllMocks();

    oauth2ClientMock.getToken.mockResolvedValueOnce({
      tokens: {
        refresh_token: "google-refresh-token",
      },
    });

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
    });
    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Access token not received from Google",
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("rejects the callback when Google does not return a refresh token", async () => {
    const state = await createValidOAuthState("auth-user-123");

    vi.clearAllMocks();

    oauth2ClientMock.getToken.mockResolvedValueOnce({
      tokens: {
        access_token: "google-access-token",
      },
    });

    const originalFetch = globalThis.fetch;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          email: "connected@gmail.com",
        }),
      })
    );

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
    });
    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Refresh token not found",
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", originalFetch);
  });

  it("returns 500 when saving the Google account fails", async () => {
    const state = await createValidOAuthState("auth-user-123");

    vi.clearAllMocks();

    oauth2ClientMock.getToken.mockResolvedValueOnce({
      tokens: {
        access_token: "google-access-token",
        refresh_token: "google-refresh-token",
      },
    });

    supabaseMock.from.mockReturnValue(
      createGoogleAccountUpsertChain({
        error: {
          message: "database unavailable",
        },
      })
    );

    const originalFetch = globalThis.fetch;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          email: "connected@gmail.com",
        }),
      })
    );

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
    });
    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Failed to save Google account",
    });

    vi.stubGlobal("fetch", originalFetch);
  });
});

