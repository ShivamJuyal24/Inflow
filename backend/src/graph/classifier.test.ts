import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    resetCircuitBreakers,
    isCircuitOpen,
    openCircuit,
    getClassifierOrder,
    classifyWithFallback,
} from "./classifier";

const { classifyWithGroqMock, classifyWithJevMock } = vi.hoisted(() => ({
    classifyWithGroqMock: vi.fn(),
    classifyWithJevMock: vi.fn(),
}));

vi.mock("./groqClassifier.js", () => ({
    classifyWithGroq: classifyWithGroqMock,
    isQuotaError: (err: unknown) => {
        if (err instanceof Error) {
            const msg = err.message.toLowerCase();
            return msg.includes("quota") || msg.includes("429") || msg.includes("rate limit");
        }
        return false;
    },
}));

vi.mock("./jevClassifier.js", () => ({
    classifyWithJev: classifyWithJevMock,
    isQuotaError: (err: unknown) => {
        if (err instanceof Error) {
            const msg = err.message.toLowerCase();
            return msg.includes("quota") || msg.includes("429") || msg.includes("rate limit");
        }
        return false;
    },
    CATEGORY_DETAILS: {
        SPAM: { reason: "r", suggested_action: "a" },
        LOW_PRIORITY: { reason: "r", suggested_action: "a" },
        INFORMATIONAL: { reason: "r", suggested_action: "a" },
        REQUIRES_REPLY: { reason: "r", suggested_action: "a" },
        MEETING: { reason: "r", suggested_action: "a" },
        IMPORTANT: { reason: "r", suggested_action: "a" },
    },
}));

const TEST_EMAIL = {
    id: "test-1",
    from: "sender@example.com",
    to: "me@example.com",
    subject: "Test",
    body: "Hello world",
};

const CLEANED_BODY = "Hello world";

describe("classifier coordinator", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        resetCircuitBreakers();
        vi.stubEnv("CLASSIFIER_ORDER", "groq,jev");
        vi.stubEnv("GROQ_CLASSIFY_KEY", "test-key");
        vi.stubEnv("JEVMODEL_API_KEY", "test-key");
    });

    describe("getClassifierOrder", () => {
        it("returns default order when env not set", () => {
            vi.stubEnv("CLASSIFIER_ORDER", "");
            expect(getClassifierOrder()).toEqual(["groq", "jev"]);
        });

        it("parses custom order", () => {
            vi.stubEnv("CLASSIFIER_ORDER", "jev,groq");
            expect(getClassifierOrder()).toEqual(["jev", "groq"]);
        });

        it("filters invalid entries", () => {
            vi.stubEnv("CLASSIFIER_ORDER", "groq,invalid,jev,rules");
            expect(getClassifierOrder()).toEqual(["groq", "jev", "rules"]);
        });
    });

    describe("circuit breakers", () => {
        it("starts with all closed", () => {
            expect(isCircuitOpen("groq")).toBe(false);
            expect(isCircuitOpen("jev")).toBe(false);
        });

        it("can open and check circuit", () => {
            openCircuit("groq");
            expect(isCircuitOpen("groq")).toBe(true);
            expect(isCircuitOpen("jev")).toBe(false);
        });

        it("resets on resetCircuitBreakers", () => {
            openCircuit("groq");
            resetCircuitBreakers();
            expect(isCircuitOpen("groq")).toBe(false);
        });
    });

    describe("classifyWithFallback", () => {
        it("uses first classifier when it succeeds", async () => {
            classifyWithGroqMock.mockResolvedValue({
                category: "IMPORTANT",
                tokensUsed: 50,
            });

            const result = await classifyWithFallback(TEST_EMAIL, CLEANED_BODY);

            expect(result.category).toBe("IMPORTANT");
            expect(result.classifierModel).toBe("groq");
            expect(result.tokensUsed).toBe(50);
            expect(classifyWithGroqMock).toHaveBeenCalledTimes(1);
            expect(classifyWithJevMock).not.toHaveBeenCalled();
        });

        it("falls back to second classifier when first fails", async () => {
            classifyWithGroqMock.mockRejectedValue(new Error("Network error"));
            classifyWithJevMock.mockResolvedValue("LOW_PRIORITY");

            const result = await classifyWithFallback(TEST_EMAIL, CLEANED_BODY);

            expect(result.category).toBe("LOW_PRIORITY");
            expect(result.classifierModel).toBe("jev");
            expect(classifyWithGroqMock).toHaveBeenCalledTimes(1);
            expect(classifyWithJevMock).toHaveBeenCalledTimes(1);
        });

        it("opens circuit on quota error and tries next", async () => {
            classifyWithGroqMock.mockRejectedValue(new Error("429 Quota exceeded"));
            classifyWithJevMock.mockResolvedValue("MEETING");

            const result = await classifyWithFallback(TEST_EMAIL, CLEANED_BODY);

            expect(result.category).toBe("MEETING");
            expect(result.classifierModel).toBe("jev");
            expect(isCircuitOpen("groq")).toBe(true);
        });

        it("skips classifier with open circuit", async () => {
            openCircuit("groq");
            classifyWithJevMock.mockResolvedValue("SPAM");

            const result = await classifyWithFallback(TEST_EMAIL, CLEANED_BODY);

            expect(result.category).toBe("SPAM");
            expect(result.classifierModel).toBe("jev");
            expect(classifyWithGroqMock).not.toHaveBeenCalled();
        });

        it("skips Jev when no API key", async () => {
            vi.stubEnv("JEVMODEL_API_KEY", "");
            classifyWithGroqMock.mockRejectedValue(new Error("Groq failed"));

            await expect(classifyWithFallback(TEST_EMAIL, CLEANED_BODY)).rejects.toThrow();
            expect(classifyWithJevMock).not.toHaveBeenCalled();
        });

        it("skips Groq when no API key", async () => {
            vi.stubEnv("GROQ_CLASSIFY_KEY", "");
            vi.stubEnv("GROQ_API_KEY", "");
            classifyWithJevMock.mockResolvedValue("REQUIRES_REPLY");

            const result = await classifyWithFallback(TEST_EMAIL, CLEANED_BODY);

            expect(result.category).toBe("REQUIRES_REPLY");
            expect(result.classifierModel).toBe("jev");
            expect(classifyWithGroqMock).not.toHaveBeenCalled();
        });

        it("throws when all classifiers fail", async () => {
            classifyWithGroqMock.mockRejectedValue(new Error("Groq failed"));
            classifyWithJevMock.mockRejectedValue(new Error("Jev failed"));

            await expect(classifyWithFallback(TEST_EMAIL, CLEANED_BODY)).rejects.toThrow("Jev failed");
        });
    });
});