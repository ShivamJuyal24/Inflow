import { describe, it, expect } from "vitest";
import { mapClassificationToAction } from "./actionMapper";
import type { EmailClassification } from "../types/classification";

const base = {
  messageId: "m1",
  reason: "reason",
  suggested_action: "action",
};

const cases: Array<
  [EmailClassification["category"], string, "PENDING" | "COMPLETED"]
> = [
  ["SPAM", "STORE", "COMPLETED"],
  ["LOW_PRIORITY", "STORE", "COMPLETED"],
  ["INFORMATIONAL", "STORE", "COMPLETED"],
  ["IMPORTANT", "REVIEW", "PENDING"],
  ["REQUIRES_REPLY", "DRAFT_REPLY", "PENDING"],
  ["MEETING", "ANALYZE_MEETING", "PENDING"],
];

describe("mapClassificationToAction", () => {
  it.each(cases)("%s -> %s (%s)", (category, type, status) => {
    const action = mapClassificationToAction({ ...base, category });

    expect(action).toEqual({
      messageId: "m1",
      type,
      status,
    });
  });

  it("passes the messageId through unchanged", () => {
    const action = mapClassificationToAction({
      ...base,
      messageId: "abc-123",
      category: "IMPORTANT",
    });

    expect(action.messageId).toBe("abc-123");
  });
});