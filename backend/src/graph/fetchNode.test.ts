import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchNode } from "./nodes";
import type { Email } from "../types/email";
import { createChain } from "../test/mocks/supabase";

const { supabaseMock, groqMock, gmailServiceMock, parserMock, configMock } =
  vi.hoisted(() => ({
    supabaseMock: { from: vi.fn() },
    groqMock: { groq: { chat: { completions: { create: vi.fn() } } } },
    gmailServiceMock: {
      getMessage: vi.fn(),
      listMessages: vi.fn(),
      listMessagePage: vi.fn(),
      listAllMessages: vi.fn(),
      sendReply: vi.fn(),
    },
    parserMock: { parseGmailMessage: vi.fn() },
    configMock: { getGmailSyncConfig: vi.fn() },
  }));

vi.mock("../config/supabase", () => ({ supabase: supabaseMock }));
vi.mock("../config/groq", () => ({ groq: groqMock.groq }));
vi.mock("../services/gmail.service", () => gmailServiceMock);
vi.mock("../services/email.parser", () => parserMock);
vi.mock("../config/gmailSync", () => ({
  getGmailSyncConfig: configMock.getGmailSyncConfig,
}));

const ACCOUNT = { email: "owner@gmail.com", refresh_token: "refresh-token" };
const stub = (id: string) => ({ id, threadId: `t-${id}` });
const doneAction = (id: string) => ({
  message_id: id,
  action_type: "STORE",
  status: "COMPLETED",
});

const parsedEmail = (id: string): Email => ({
  id,
  threadId: `t-${id}`,
  from: "sender@example.com",
  to: "owner+alias@gmail.com",
  subject: `Subject ${id}`,
  body: `Body ${id}`,
  receivedAt: "2026-09-01T00:00:00.000Z",
});

/** Single-page listing. */
const listOnePage = (ids: string[]) =>
  gmailServiceMock.listMessagePage.mockResolvedValue({
    messages: ids.map(stub),
    nextPageToken: undefined,
  });

/** Static per-table results (createChain ignores filters). */
function setupSupabase(options: {
  accountError?: any;
  emailsError?: any;
  actionsError?: any;
  emailRows?: { message_id: string; category: string | null }[];
  actionRows?: { message_id: string; action_type: string; status: string }[];
}) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "google_accounts") {
      return createChain({
        data: options.accountError ? null : ACCOUNT,
        error: options.accountError ?? null,
      });
    }
    if (table === "emails") {
      return createChain({
        data: options.emailsError ? null : (options.emailRows ?? []),
        error: options.emailsError ?? null,
      });
    }
    if (table === "email_actions") {
      return createChain({
        data: options.actionsError ? null : (options.actionRows ?? []),
        error: options.actionsError ?? null,
      });
    }
    return createChain({ data: [], error: null });
  });
}

/* ── Stateful fake DB for multi-run scenarios ── */
const db = {
  emails: new Map<string, string | null>(),
  actions: new Map<string, { action_type: string; status: string }[]>(),
};

function wireStatefulSupabase() {
  supabaseMock.from.mockImplementation((table: string) => {
    let ids: string[] = [];
    const chain: any = {
      select: () => chain,
      limit: () => chain,
      not: () => chain,
      eq: () => chain,
      in: (col: string, values: string[]) => {
        if (col === "message_id") ids = values;
        return chain;
      },
      single: () => Promise.resolve({ data: ACCOUNT, error: null }),
      then: (resolve: any, reject: any) => {
        let rows: any[] = [];
        if (table === "emails") {
          rows = ids
            .filter((id) => db.emails.has(id))
            .map((id) => ({ message_id: id, category: db.emails.get(id) }));
        } else if (table === "email_actions") {
          rows = ids.flatMap((id) =>
            (db.actions.get(id) ?? []).map((a) => ({ message_id: id, ...a }))
          );
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return chain;
  });
}

/** Pretend the rest of the graph fully processed these emails. */
function markProcessed(emails: Email[] | undefined) {
  for (const e of emails ?? []) {
    db.emails.set(e.id, "SPAM");
    db.actions.set(e.id, [{ action_type: "STORE", status: "COMPLETED" }]);
  }
}

/** Fake Gmail inbox that honors maxResults + pageToken. */
function listFromInbox(allIds: string[]) {
  gmailServiceMock.listMessagePage.mockImplementation(
    async (_token: string, opts?: { maxResults?: number; pageToken?: string }) => {
      const start = opts?.pageToken ? Number(opts.pageToken) : 0;
      const size = opts?.maxResults ?? 100;
      const end = start + size;
      return {
        messages: allIds.slice(start, end).map(stub),
        nextPageToken: end < allIds.length ? String(end) : undefined,
      };
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.emails.clear();
  db.actions.clear();
  configMock.getGmailSyncConfig.mockReturnValue({
    pageSize: 40,
    maxMessages: 120,
    maxScan: 5000,
  });
  gmailServiceMock.getMessage.mockImplementation(
    async (_t: string, id: string) => ({ id })
  );
  parserMock.parseGmailMessage.mockImplementation((m: { id: string }) =>
    parsedEmail(m.id)
  );
});

describe("fetchNode", () => {
  it("fetches full bodies only for messages that still need work", async () => {
    listOnePage(Array.from({ length: 12 }, (_, i) => `m${i + 1}`));
    setupSupabase({
      emailRows: ["m1", "m2", "m3", "m4", "m5"].map((id) => ({
        message_id: id,
        category: "SPAM",
      })),
      actionRows: ["m1", "m2", "m3", "m4", "m5"].map(doneAction),
    });

    const result = await fetchNode({} as any);

    expect(gmailServiceMock.listMessagePage).toHaveBeenCalledWith(
      "refresh-token",
      { maxResults: 40, pageToken: undefined }
    );
    expect(gmailServiceMock.getMessage).toHaveBeenCalledTimes(7);
    expect(result.emails?.map((e) => e.id)).toEqual([
      "m6", "m7", "m8", "m9", "m10", "m11", "m12",
    ]);
  });

  it("attributes the run to the connected Google account", async () => {
    listOnePage(["m1"]);
    setupSupabase({});
    const result = await fetchNode({} as any);
    expect(result.accountEmail).toBe("owner@gmail.com");
  });

  it("re-fetches persisted emails that have no classification yet", async () => {
    listOnePage(["m1"]);
    setupSupabase({ emailRows: [{ message_id: "m1", category: null }] });

    const result = await fetchNode({} as any);

    expect(gmailServiceMock.getMessage).toHaveBeenCalledWith("refresh-token", "m1");
    expect(result.emails).toHaveLength(1);
  });

  it("re-fetches classified emails that have NO action row (recovery)", async () => {
    listOnePage(["m1"]);
    setupSupabase({
      emailRows: [{ message_id: "m1", category: "REQUIRES_REPLY" }],
      actionRows: [],
    });

    const result = await fetchNode({} as any);

    expect(result.emails?.map((e) => e.id)).toEqual(["m1"]);
  });

  it("re-fetches classified emails with a pending workflow action", async () => {
    listOnePage(["m1"]);
    setupSupabase({
      emailRows: [{ message_id: "m1", category: "REQUIRES_REPLY" }],
      actionRows: [
        { message_id: "m1", action_type: "DRAFT_REPLY", status: "PENDING" },
      ],
    });

    await fetchNode({} as any);

    expect(gmailServiceMock.getMessage).toHaveBeenCalledWith("refresh-token", "m1");
  });

  it("does not re-fetch when only a non-workflow action is pending", async () => {
    listOnePage(["m1"]);
    setupSupabase({
      emailRows: [{ message_id: "m1", category: "IMPORTANT" }],
      actionRows: [
        { message_id: "m1", action_type: "REVIEW", status: "PENDING" },
      ],
    });

    await fetchNode({} as any);

    expect(gmailServiceMock.getMessage).not.toHaveBeenCalled();
  });

  it("skips a message whose full fetch fails and keeps the rest", async () => {
    listOnePage(["m1", "m2"]);
    setupSupabase({});
    gmailServiceMock.getMessage.mockImplementation(
      async (_t: string, id: string) => {
        if (id === "m1") throw new Error("backend error");
        return { id };
      }
    );

    const result = await fetchNode({} as any);

    expect(gmailServiceMock.getMessage).toHaveBeenCalledTimes(2);
    expect(result.emails?.map((e) => e.id)).toEqual(["m2"]);
  });

  it("propagates Gmail list failures with the page index", async () => {
    gmailServiceMock.listMessagePage.mockRejectedValue(new Error("unauthorized"));
    setupSupabase({});

    await expect(fetchNode({} as any)).rejects.toThrow(
      "Gmail list failed on page 0: unauthorized"
    );
  });

  it("propagates account lookup failures", async () => {
    setupSupabase({ accountError: { message: "no rows" } });

    await expect(fetchNode({} as any)).rejects.toThrow(
      "Failed to get Google account: no rows"
    );
  });

  it("returns early without further lookups when nothing is listed", async () => {
    listOnePage([]);
    setupSupabase({});

    const result = await fetchNode({} as any);

    expect(result.emails).toEqual([]);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1); // google_accounts only
    expect(gmailServiceMock.getMessage).not.toHaveBeenCalled();
  });

  it("dedupes repeated message ids within a run", async () => {
    listOnePage(["m1", "m1", "m2"]);
    setupSupabase({});

    const result = await fetchNode({} as any);

    expect(result.emails?.map((e) => e.id)).toEqual(["m1", "m2"]);
  });
});

describe("fetchNode across multiple runs", () => {
  it("drains a 250-message backlog with a 100-message cap, each message exactly once", async () => {
    configMock.getGmailSyncConfig.mockReturnValue({
      pageSize: 100,
      maxMessages: 100,
      maxScan: 5000,
    });
    const allIds = Array.from({ length: 250 }, (_, i) => `m${i + 1}`);
    listFromInbox(allIds);
    wireStatefulSupabase();

    const seen: string[] = [];
    const runSizes: number[] = [];
    const listCalls: number[] = [];

    for (let run = 0; run < 3; run++) {
      gmailServiceMock.listMessagePage.mockClear();
      const result = await fetchNode({} as any);
      const ids = (result.emails ?? []).map((e) => e.id);
      runSizes.push(ids.length);
      listCalls.push(gmailServiceMock.listMessagePage.mock.calls.length);
      seen.push(...ids);
      markProcessed(result.emails);
    }

    expect(runSizes).toEqual([100, 100, 50]);
    // Run 1 stops after one page; later runs page past already-finished mail
    expect(listCalls).toEqual([1, 2, 3]);
    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);

    // Fully drained: a fourth run has nothing left to fetch
    const final = await fetchNode({} as any);
    expect(final.emails).toEqual([]);
  });

  it("recovers a message whose fetch failed on the next run, without re-fetching others", async () => {
    listFromInbox(["m1", "m2", "m3"]);
    wireStatefulSupabase();
    let failOnce = true;
    gmailServiceMock.getMessage.mockImplementation(
      async (_t: string, id: string) => {
        if (id === "m2" && failOnce) {
          failOnce = false;
          throw new Error("503");
        }
        return { id };
      }
    );

    const run1 = await fetchNode({} as any);
    expect(run1.emails?.map((e) => e.id)).toEqual(["m1", "m3"]);
    markProcessed(run1.emails);

    const run2 = await fetchNode({} as any);
    expect(run2.emails?.map((e) => e.id)).toEqual(["m2"]);
    markProcessed(run2.emails);

    const run3 = await fetchNode({} as any);
    expect(run3.emails).toEqual([]);
  });

  it("re-selects a classified email whose action write failed, then stops once the action exists", async () => {
    listFromInbox(["m1"]);
    wireStatefulSupabase();
    db.emails.set("m1", "REQUIRES_REPLY"); // classified, but no action row

    const run1 = await fetchNode({} as any);
    expect(run1.emails?.map((e) => e.id)).toEqual(["m1"]);

    db.actions.set("m1", [{ action_type: "DRAFT_REPLY", status: "COMPLETED" }]);
    const run2 = await fetchNode({} as any);
    expect(run2.emails).toEqual([]);
  });
});