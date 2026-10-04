import { describe, it, expect, vi, beforeEach } from "vitest";

const { messagesListMock } = vi.hoisted(() => ({
  messagesListMock: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials = vi.fn();
      },
    },
    gmail: vi.fn(() => ({
      users: { messages: { list: messagesListMock } },
    })),
  },
}));

import { listAllMessages, listMessagePage } from "./gmail.service";

const pageOf = (ids: string[], nextPageToken?: string) => ({
  data: {
    messages: ids.map((id) => ({ id, threadId: `t-${id}` })),
    nextPageToken,
  },
});

const ids = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => `m${offset + i}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listMessagePage", () => {
  it("returns messages and the next page token", async () => {
    messagesListMock.mockResolvedValue(pageOf(["a", "b"], "token-1"));

    const page = await listMessagePage("refresh", {
      maxResults: 2,
      pageToken: "token-0",
    });

    expect(page.messages).toHaveLength(2);
    expect(page.nextPageToken).toBe("token-1");
    expect(messagesListMock).toHaveBeenCalledWith({
      userId: "me",
      maxResults: 2,
      pageToken: "token-0",
      q: "in:inbox -category:promotions -category:social -category:updates",
    });
  });

  it("treats a malformed response as an empty final page", async () => {
    messagesListMock.mockResolvedValue({ data: {} });

    const page = await listMessagePage("refresh");

    expect(page.messages).toEqual([]);
    expect(page.nextPageToken).toBeUndefined();
  });

  it("drops a falsy next page token", async () => {
    messagesListMock.mockResolvedValue({
      data: { messages: [{ id: "a" }], nextPageToken: "" },
    });

    const page = await listMessagePage("refresh");

    expect(page.nextPageToken).toBeUndefined();
  });
});

describe("listAllMessages", () => {
  it("collects more than 10 messages across multiple pages", async () => {
    messagesListMock
      .mockResolvedValueOnce(pageOf(ids(10), "token-1"))
      .mockResolvedValueOnce(pageOf(ids(10, 10), "token-2"))
      .mockResolvedValueOnce(pageOf(ids(5, 20)));

    const messages = await listAllMessages("refresh", {
      pageSize: 10,
      maxMessages: 100,
    });

    expect(messages).toHaveLength(25);
    expect(messagesListMock).toHaveBeenCalledTimes(3);
    // Each follow-up request continues from the previous page's token
    expect(messagesListMock.mock.calls[1][0].pageToken).toBe("token-1");
    expect(messagesListMock.mock.calls[2][0].pageToken).toBe("token-2");
  });

  it("stops after a page with no next-page token", async () => {
    messagesListMock.mockResolvedValue(pageOf(ids(10)));

    const messages = await listAllMessages("refresh", { pageSize: 10 });

    expect(messages).toHaveLength(10);
    expect(messagesListMock).toHaveBeenCalledTimes(1);
  });

  it("stops when a follow-up page comes back empty", async () => {
    messagesListMock
      .mockResolvedValueOnce(pageOf(ids(10), "token-1"))
      .mockResolvedValueOnce({ data: {} });

    const messages = await listAllMessages("refresh", { pageSize: 10 });

    expect(messages).toHaveLength(10);
    expect(messagesListMock).toHaveBeenCalledTimes(2);
  });

  it("honors maxMessages and shrinks the final page request", async () => {
    messagesListMock
      .mockResolvedValueOnce(pageOf(ids(10), "token-1"))
      .mockResolvedValueOnce(pageOf(ids(5, 10)));

    const messages = await listAllMessages("refresh", {
      pageSize: 10,
      maxMessages: 15,
    });

    expect(messages).toHaveLength(15);
    expect(messagesListMock).toHaveBeenCalledTimes(2);
    // Only 5 slots remain, so the second request asks for 5, not 10
    expect(messagesListMock.mock.calls[1][0].maxResults).toBe(5);
  });

  it("does not issue a second request when the limit is already reached", async () => {
    messagesListMock.mockResolvedValueOnce(pageOf(ids(10)));

    const messages = await listAllMessages("refresh", {
      pageSize: 10,
      maxMessages: 10,
    });

    expect(messages).toHaveLength(10);
    expect(messagesListMock).toHaveBeenCalledTimes(1);
  });

  it("clamps the page size to Gmail's 500 maximum", async () => {
    messagesListMock.mockResolvedValueOnce(pageOf(ids(3)));

    await listAllMessages("refresh", { pageSize: 5000 });

    expect(messagesListMock.mock.calls[0][0].maxResults).toBe(500);
  });

  it("wraps API errors with the failing page index", async () => {
    messagesListMock
      .mockResolvedValueOnce(pageOf(ids(10), "token-1"))
      .mockRejectedValueOnce(new Error("invalid credentials"));

    await expect(
      listAllMessages("refresh", { pageSize: 10 })
    ).rejects.toThrow("Gmail list failed on page 1: invalid credentials");
  });

  it("propagates an error on the very first page", async () => {
    messagesListMock.mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(listAllMessages("refresh")).rejects.toThrow(
      "Gmail list failed on page 0: quota exceeded"
    );
  });

  it("skips entries without an id and repeated ids", async () => {
    messagesListMock.mockResolvedValueOnce({
      data: {
        messages: [
          { id: "a", threadId: "t" },
          { id: "a", threadId: "t" },
          { threadId: "t" },
          { id: "b", threadId: "t" },
        ],
      },
    });

    const messages = await listAllMessages("refresh");

    expect(messages.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
