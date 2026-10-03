import { describe, it, expect } from "vitest";
import {
  ALL_CATEGORIES,
  formatReport,
  scoreClassifications,
} from "./classificationEval.js";
import { CLASSIFICATION_FIXTURES } from "./classificationFixtures.js";

describe("classification fixtures", () => {
  it("have unique ids and complete fields", () => {
    const ids = CLASSIFICATION_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const fixture of CLASSIFICATION_FIXTURES) {
      expect(fixture.from, fixture.id).toBeTruthy();
      expect(fixture.subject, fixture.id).toBeTruthy();
      expect(fixture.body.length, fixture.id).toBeGreaterThan(20);
    }
  });

  it("cover every category with at least three examples", () => {
    for (const category of ALL_CATEGORIES) {
      const count = CLASSIFICATION_FIXTURES.filter(
        (f) => f.expected === category
      ).length;
      expect(count, category).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("scoreClassifications", () => {
  it("computes accuracy, precision, recall and confusions", () => {
    const report = scoreClassifications([
      { expected: "MEETING", predicted: "MEETING" },
      { expected: "MEETING", predicted: "REQUIRES_REPLY" },
      { expected: "MEETING", predicted: "REQUIRES_REPLY" },
      { expected: "REQUIRES_REPLY", predicted: "REQUIRES_REPLY" },
      { expected: "SPAM", predicted: null },
    ]);

    expect(report.total).toBe(5);
    expect(report.correct).toBe(2);
    expect(report.errors).toBe(1);
    expect(report.accuracy).toBeCloseTo(0.4);

    // MEETING: 1 of 3 found, and everything predicted MEETING was right.
    expect(report.perCategory.MEETING.recall).toBeCloseTo(1 / 3);
    expect(report.perCategory.MEETING.precision).toBe(1);

    // REQUIRES_REPLY: found its one email, but 3 predictions for 1 right.
    expect(report.perCategory.REQUIRES_REPLY.recall).toBe(1);
    expect(report.perCategory.REQUIRES_REPLY.precision).toBeCloseTo(1 / 3);

    // Never predicted, never expected -> undefined rather than 0.
    expect(report.perCategory.IMPORTANT.precision).toBeNull();
    expect(report.perCategory.IMPORTANT.recall).toBeNull();

    expect(report.confusions[0]).toEqual({
      expected: "MEETING",
      predicted: "REQUIRES_REPLY",
      count: 2,
    });
    expect(report.confusions).toContainEqual({
      expected: "SPAM",
      predicted: "ERROR",
      count: 1,
    });
  });

  it("handles an empty run", () => {
    const report = scoreClassifications([]);
    expect(report.total).toBe(0);
    expect(report.accuracy).toBe(0);
    expect(report.confusions).toEqual([]);
  });

  it("formats a readable report", () => {
    const text = formatReport(
      scoreClassifications([
        { expected: "MEETING", predicted: "REQUIRES_REPLY" },
        { expected: "SPAM", predicted: "SPAM" },
      ])
    );

    expect(text).toContain("Accuracy: 1/2 (50.0%)");
    expect(text).toContain("MEETING -> REQUIRES_REPLY");
  });
});
