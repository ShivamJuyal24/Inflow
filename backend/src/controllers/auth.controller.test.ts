import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseMock, oauth2ClientMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
  oauth2ClientMock: {
    generateAuthUrl: vi.fn(),
    getToken: vi.fn(),
    setCredentials: vi.fn(),
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

const OAUTH_STATE_COOKIE = "oauth_state_nonce";

function createReq(
  options: {
    userId?: string;
    query?: Record<string, unknown>;
    cookie?: string;
  } = {}
) {
  return {
    user: options.userId ? { id: options.userId } : undefined,
    query: options.query ?? {},
    headers: options.cookie
      ? {
          cookie: options.cookie,
        }
      : {},
  } as any;
}

function createRes() {
  const res: any = {};

  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.redirect = vi.fn(() => res);
  res.cookie = vi.fn(() => res);
  res.clearCookie = vi.fn(() => res);

  return res;
}

function createGoogleAccountChain(options: {
  existingAccount?: { user_id: string | null } | null;
  lookupError?: any;
  upsertResult?: { data?: any; error?: any };
} = {}) {
  const upsertMock = vi.fn(() =>
    Promise.resolve(options.upsertResult ?? { data: null, error: null })
  );

  const maybeSingleMock = vi.fn(() =>
    Promise.resolve({
      data: options.existingAccount ?? null,
      error: options.lookupError ?? null,
    })
  );

  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: maybeSingleMock,
      })),
    })),
    upsert: upsertMock,
  };
}

function createGoogleAccountUpsertChain(result: {
  data?: any;
  error?: any;
}) {
  return createGoogleAccountChain({
    upsertResult: result,
  });
}

async function createValidOAuthState(userId: string) {
  oauth2ClientMock.generateAuthUrl.mockImplementation(
    (options: Record<string, unknown>) => {
      return `https://accounts.google.com/o/oauth2/auth?state=${encodeURIComponent(
        String(options.state)
      )}`;
    }
  );

  const req = createReq({ userId });
  const res = createRes();

  await googleAuth(req, res);

  const authUrl = oauth2ClientMock.generateAuthUrl.mock.calls[0][0];
  const state = authUrl.state as string;

  const cookieCall = res.cookie.mock.calls[0];

  const cookieName = cookieCall?.[0];
  const nonce = cookieCall?.[1];

  expect(cookieName).toBe(OAUTH_STATE_COOKIE);
  expect(typeof nonce).toBe("string");
  expect(nonce.length).toBeGreaterThan(0);

  return {
    state,
    nonce: nonce as string,
  };
}

function createCookie(nonce: string) {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(nonce)}`;
}

async function mockSuccessfulGoogleTokenExchange() {
  oauth2ClientMock.getToken.mockResolvedValueOnce({
    tokens: {
      access_token: "google-access-token",
      refresh_token: "google-refresh-token",
      token_type: "Bearer",
      scope: "scope-a scope-b",
      expiry_date: Date.now() + 3600000,
    },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        email: "connected@gmail.com",
      }),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  process.env.SUPABASE_SECRET_KEY = "test-secret-key";
  process.env.NODE_ENV = "test";
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
    expect(res.cookie).not.toHaveBeenCalled();
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

    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(
      OAUTH_STATE_COOKIE,
      expect.any(String),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 10 * 60 * 1000,
      }
    );

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

  it("generates a unique nonce for each OAuth initiation", async () => {
    const firstReq = createReq({
      userId: "auth-user-123",
    });

    const firstRes = createRes();

    await googleAuth(firstReq, firstRes);

    const firstNonce = firstRes.cookie.mock.calls[0][1];

    vi.clearAllMocks();

    const secondReq = createReq({
      userId: "auth-user-123",
    });

    const secondRes = createRes();

    await googleAuth(secondReq, secondRes);

    const secondNonce = secondRes.cookie.mock.calls[0][1];

    expect(firstNonce).not.toBe(secondNonce);
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
    const { state } = await createValidOAuthState("auth-user-123");

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

  it("rejects a callback when the OAuth state cookie is missing", async () => {
    const { state } = await createValidOAuthState("auth-user-123");

    vi.clearAllMocks();

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
      message: "Invalid OAuth state",
    });

    expect(oauth2ClientMock.getToken).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("rejects a callback when the OAuth state cookie nonce does not match", async () => {
    const { state } = await createValidOAuthState("auth-user-123");

    vi.clearAllMocks();

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
      cookie: createCookie("attacker-controlled-nonce"),
    });

    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid OAuth state",
    });

    expect(oauth2ClientMock.getToken).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it("rejects an expired OAuth state", async () => {
    const originalNow = Date.now;

    const issuedAt = originalNow() - 10 * 60 * 1000 - 1;

    vi.spyOn(Date, "now").mockReturnValueOnce(issuedAt);

    const { state, nonce } =
      await createValidOAuthState("auth-user-123");

    vi.restoreAllMocks();
    vi.clearAllMocks();

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
      cookie: createCookie(nonce),
    });

    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid or expired OAuth state",
    });

    expect(oauth2ClientMock.getToken).not.toHaveBeenCalled();
  });

  it("rejects a future-dated OAuth state", async () => {
    const originalNow = Date.now;

    const issuedAt = originalNow() + 60 * 1000;

    vi.spyOn(Date, "now").mockReturnValueOnce(issuedAt);

    const { state, nonce } =
      await createValidOAuthState("auth-user-123");

    vi.restoreAllMocks();
    vi.clearAllMocks();

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
      cookie: createCookie(nonce),
    });

    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid or expired OAuth state",
    });

    expect(oauth2ClientMock.getToken).not.toHaveBeenCalled();
  });

  it("stores the Google account with the signed OAuth user ID when the browser nonce matches", async () => {
    const userId = "auth-user-123";

    const { state, nonce } =
      await createValidOAuthState(userId);

    vi.clearAllMocks();

    await mockSuccessfulGoogleTokenExchange();

    const upsertMock = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: null,
      })
    );

    supabaseMock.from.mockReturnValue({
      ...createGoogleAccountChain(),
      upsert: upsertMock,
    });

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
      cookie: createCookie(nonce),
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

    expect(res.clearCookie).toHaveBeenCalledWith(
      OAUTH_STATE_COOKIE,
      {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
      }
    );

    expect(res.json).toHaveBeenCalledWith({
      message: "Google OAuth successful",
      email: "connected@gmail.com",
      refreshTokenStored: true,
    });
  });

  it("does not trust a client-provided user ID when saving the account", async () => {
    const authenticatedUserId = "verified-user-123";

    const { state, nonce } =
      await createValidOAuthState(authenticatedUserId);

    vi.clearAllMocks();

    await mockSuccessfulGoogleTokenExchange();

    const upsertMock = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: null,
      })
    );

    supabaseMock.from.mockReturnValue({
      ...createGoogleAccountChain(),
      upsert: upsertMock,
    });

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
      headers: {
        cookie: createCookie(nonce),
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
  });

  it("allows reconnecting a Google account already owned by the same user", async () => {
    const userId = "auth-user-123";

    const { state, nonce } =
      await createValidOAuthState(userId);

    vi.clearAllMocks();

    await mockSuccessfulGoogleTokenExchange();

    const upsertMock = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: null,
      })
    );

    supabaseMock.from.mockReturnValue({
      ...createGoogleAccountChain({
        existingAccount: { user_id: userId },
      }),
      upsert: upsertMock,
    });

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
      cookie: createCookie(nonce),
    });

    const res = createRes();

    await googleCallback(req, res);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "connected@gmail.com",
        user_id: userId,
      }),
      {
        onConflict: "email",
      }
    );

    expect(res.json).toHaveBeenCalledWith({
      message: "Google OAuth successful",
      email: "connected@gmail.com",
      refreshTokenStored: true,
    });
  });

  it("rejects an existing Google account owned by another user without overwriting it", async () => {
    const authenticatedUserId = "auth-user-123";
    const existingOwnerId = "different-user-456";

    const { state, nonce } =
      await createValidOAuthState(authenticatedUserId);

    vi.clearAllMocks();

    await mockSuccessfulGoogleTokenExchange();

    const upsertMock = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: null,
      })
    );

    supabaseMock.from.mockReturnValue({
      ...createGoogleAccountChain({
        existingAccount: { user_id: existingOwnerId },
      }),
      upsert: upsertMock,
    });

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
      cookie: createCookie(nonce),
    });

    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Google account is already connected to another user",
    });

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the Google account ownership lookup fails", async () => {
    const { state, nonce } =
      await createValidOAuthState("auth-user-123");

    vi.clearAllMocks();

    await mockSuccessfulGoogleTokenExchange();

    const upsertMock = vi.fn();

    supabaseMock.from.mockReturnValue({
      ...createGoogleAccountChain({
        lookupError: {
          message: "database unavailable",
        },
      }),
      upsert: upsertMock,
    });

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
      cookie: createCookie(nonce),
    });

    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Failed to verify Google account ownership",
    });

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects the callback when Google does not return an access token", async () => {
    const { state, nonce } =
      await createValidOAuthState("auth-user-123");

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
      cookie: createCookie(nonce),
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
    const { state, nonce } =
      await createValidOAuthState("auth-user-123");

    vi.clearAllMocks();

    oauth2ClientMock.getToken.mockResolvedValueOnce({
      tokens: {
        access_token: "google-access-token",
      },
    });

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
      cookie: createCookie(nonce),
    });

    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Refresh token not found",
    });

    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("returns 500 when saving the Google account fails", async () => {
    const { state, nonce } =
      await createValidOAuthState("auth-user-123");

    vi.clearAllMocks();

    await mockSuccessfulGoogleTokenExchange();

    supabaseMock.from.mockReturnValue(
      createGoogleAccountUpsertChain({
        error: {
          message: "database unavailable",
        },
      })
    );

    const req = createReq({
      query: {
        code: "google-code",
        state,
      },
      cookie: createCookie(nonce),
    });

    const res = createRes();

    await googleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Failed to save Google account",
    });
  });
});