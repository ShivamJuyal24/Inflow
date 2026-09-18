import { describe, it, expect, vi, beforeEach } from "vitest";
import { listEmails } from "./email.controller";
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

const req = (query: any = {}) => ({ query }) as any;

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
  it("applies NEEDS_ATTENTION as an IN-filter before pagination", async () => {
    const chain = createChain({ data: [], error: null, count: 4 });
    supabaseMock.from.mockReturnValueOnce(chain);

    const res = createRes();
    await listEmails(
      req({ category: "NEEDS_ATTENTION", page: "2", limit: "10" }),
      res
    );

    expect(chain.in).toHaveBeenCalledWith("category", [
      "IMPORTANT",
      "REQUIRES_REPLY",
      "MEETING",
    ]);
    // Must NOT also apply an exact-match category filter
    expect(chain.eq).not.toHaveBeenCalledWith(
      "category",
      expect.anything()
    );
    // Pagination range still computed from page 2 / limit 10
    expect(chain.range).toHaveBeenCalledWith(10, 19);
    expect(res.json.mock.calls[0][0].pagination).toEqual({
      page: 2,
      limit: 10,
      total: 4,
      totalPages: 1,
    });
  });

  it("applies a plain category as an exact-match filter", async () => {
    const chain = createChain({ data: [], error: null, count: 0 });
    supabaseMock.from.mockReturnValueOnce(chain);

    const res = createRes();
    await listEmails(req({ category: "SPAM" }), res);

    expect(chain.eq).toHaveBeenCalledWith("category", "SPAM");
    expect(chain.in).not.toHaveBeenCalled();
  });

  it("defaults to page 1, limit 20", async () => {
    const chain = createChain({ data: [], error: null, count: 0 });
    supabaseMock.from.mockReturnValueOnce(chain);

    const res = createRes();
    await listEmails(req({}), res);

    expect(chain.range).toHaveBeenCalledWith(0, 19);
    expect(res.json.mock.calls[0][0].pagination.page).toBe(1);
    expect(res.json.mock.calls[0][0].pagination.limit).toBe(20);
  });

  it("returns 500 when Supabase fails", async () => {
    supabaseMock.from.mockReturnValueOnce(
      createChain({ data: null, error: { message: "boom" } })
    );

    const res = createRes();
    await listEmails(req({}), res);

    expect(res.status.mock.calls[0][0]).toBe(500);
  });
});