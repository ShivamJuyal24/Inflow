import { describe, it, expect, vi } from "vitest";
import { END } from "@langchain/langgraph";
import { routeActions } from "./nodes";
import type { EmailTriageState } from "./state";
import type { EmailAction } from "../types/action";

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

const action = (type: EmailAction["type"]): EmailAction => ({
  messageId: "m1",
  type,
  status: "PENDING",
});

const stateWith = (actions: EmailAction[]) =>
  ({ actions }) as unknown as EmailTriageState;

describe("routeActions", () => {
  it("routes to END when there are no actions", () => {
    expect(routeActions(stateWith([]))).toBe(END);
  });

  it("routes STORE/REVIEW actions to END (nothing downstream)", () => {
    expect(
      routeActions(stateWith([action("STORE"), action("REVIEW")]))
    ).toBe(END);
  });

  it("routes DRAFT_REPLY to draftWorkFlow", () => {
    expect(routeActions(stateWith([action("DRAFT_REPLY")]))).toEqual([
      "draftWorkFlow",
    ]);
  });

  it("routes ANALYZE_MEETING to meetingWorkFlow", () => {
    expect(routeActions(stateWith([action("ANALYZE_MEETING")]))).toEqual([
      "meetingWorkFlow",
    ]);
  });

  it("routes both when both action types exist", () => {
    const result = routeActions(
      stateWith([action("DRAFT_REPLY"), action("ANALYZE_MEETING")])
    ) as string[];

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining(["draftWorkFlow", "meetingWorkFlow"])
    );
  });
});