import { describe, it, expect } from "vitest";
import { cleanEmailBody } from "./jevClassifier";

describe("cleanEmailBody", () => {
  it("returns short bodies unchanged (minus URLs/whitespace)", () => {
    expect(cleanEmailBody("Hello there, this is a short email.")).toBe(
      "Hello there, this is a short email."
    );
  });

  it("keeps both the head and the tail of long bodies", () => {
    const head = "HEADSTART ".repeat(200); // 2000 chars
    const middle = "middle ".repeat(2000); // 14000 chars
    const tail = "TAILTHATMATTERS ".repeat(200); // 3200 chars
    const body = head + middle + tail;

    const cleaned = cleanEmailBody(body);

    expect(cleaned).toContain("HEADSTART");
    expect(cleaned).toContain("TAILTHATMATTERS");
    expect(cleaned).toContain("middle of email omitted");
    expect(cleaned.length).toBeLessThan(1300);
  });

  it("strips URLs", () => {
    expect(cleanEmailBody("see https://example.com/x for details")).toBe(
      "see for details"
    );
  });
});
