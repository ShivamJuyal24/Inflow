/**
 * Groq email classifier using a reasoning model (default: openai/gpt-oss-20b).
 *
 * Uses reasoning effort: low, max completion tokens ~400, JSON output.
 * Retries once if finish_reason is "length" or content is empty.
 * Kept free of Supabase imports so it can be used by the offline
 * evaluation script and unit tests without any database configuration.
 */

import { groqClassify, GROQ_CLASSIFY_MODEL } from "../config/groq.js";
import type { JevCategory } from "./jevClassifier.js";
import { CATEGORY_CRITERIA, CATEGORY_DETAILS } from "./jevClassifier.js";

// Re-export for compatibility
export type { JevCategory };
export { CATEGORY_CRITERIA, CATEGORY_DETAILS } from "./jevClassifier.js";

const ALLOWED_CATEGORIES: readonly JevCategory[] = [
    "SPAM",
    "LOW_PRIORITY",
    "INFORMATIONAL",
    "REQUIRES_REPLY",
    "MEETING",
    "IMPORTANT",
] as const;

const SYSTEM_PROMPT = `
You are an email classification system. Classify the email into exactly one category.

Categories and criteria:
${Object.entries(CATEGORY_CRITERIA)
    .map(([cat, crit]) => `- ${cat}: ${crit}`)
    .join("\n")}

Critical rules (precedence order):
1. SPAM > MEETING > IMPORTANT > REQUIRES_REPLY > INFORMATIONAL > LOW_PRIORITY
2. Marketing/promotions are LOW_PRIORITY, not INFORMATIONAL or SPAM.
3. A serious or time-sensitive notice is IMPORTANT even if it asks for a reply.

Output ONLY valid JSON with this schema:
{"category": "CATEGORY_NAME"}

No extra text, no markdown, no explanation.
`.trim();

interface GroqClassifyResponse {
    category: string;
}

/**
 * Classify an email using Groq reasoning model.
 * Uses reasoning effort: low, max completion tokens ~400, JSON output.
 * Retries once if finish_reason is "length" or content is empty.
 * Returns the category and logs token usage.
 */
export async function classifyWithGroq(
    email: {
        id: string;
        from: string;
        to: string;
        subject: string;
        body: string;
    },
    cleanedBody: string
): Promise<{ category: JevCategory; tokensUsed: number }> {
    const apiKey = process.env.GROQ_CLASSIFY_KEY ?? process.env.GROQ_API_KEY;

    if (!apiKey) {
        throw new Error("Missing GROQ_CLASSIFY_KEY or GROQ_API_KEY environment variable");
    }

    const userPrompt = `
Email to classify:
From: ${email.from}
To: ${email.to}
Subject: ${email.subject}

Body:
${cleanedBody}
`.trim();

    let lastError: Error | null = null;

    // Retry once if finish_reason is "length" or content is empty
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await groqClassify.chat.completions.create({
                model: GROQ_CLASSIFY_MODEL,
                temperature: 0,
                max_completion_tokens: 400,
                response_format: { type: "json_object" },
                reasoning_effort: "low",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userPrompt },
                ],
            });

            const choice = response.choices[0];
            const finishReason = choice?.finish_reason;
            const content = choice?.message?.content?.trim();

            // Check for length truncation or empty content - retry once
            if (finishReason === "length" || !content) {
                const reason = finishReason === "length" ? "finish_reason: length" : "empty content";
                console.warn(`Groq classification attempt ${attempt + 1} for ${email.id}: ${reason}, retrying...`);
                lastError = new Error(`Groq ${reason} for email ${email.id}`);
                continue; // retry
            }

            let parsed: GroqClassifyResponse;
            try {
                parsed = JSON.parse(content!);
            } catch (e) {
                throw new Error(`Groq returned invalid JSON for email ${email.id}: ${content}`);
            }

            const category = parsed.category;

            if (
                typeof category !== "string" ||
                !ALLOWED_CATEGORIES.includes(category as JevCategory)
            ) {
                throw new Error(
                    `Groq returned invalid category "${category}" for email ${email.id}. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`
                );
            }

            // Log token usage
            const usage = response.usage;
            const tokensUsed = usage?.total_tokens ?? 0;
            console.log(
                `Groq classification for ${email.id}: ${category} (tokens: ${tokensUsed}, prompt: ${usage?.prompt_tokens ?? 0}, completion: ${usage?.completion_tokens ?? 0}, finish_reason: ${finishReason})`
            );

            return { category: category as JevCategory, tokensUsed };

        } catch (error: any) {
            lastError = error;
            // Don't retry on non-length/empty errors
            if (attempt === 1 || (error.message && !error.message.includes("length") && !error.message.includes("empty content"))) {
                throw error;
            }
            // For length/empty on first attempt, loop will retry
        }
    }

    // Both attempts failed
    throw lastError ?? new Error(`Groq classification failed for email ${email.id} after 2 attempts`);
}

/**
 * Check if an error is a quota/auth error that should trigger circuit breaker.
 */
export function isQuotaError(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return (
            msg.includes("quota") ||
            msg.includes("rate limit") ||
            msg.includes("429") ||
            msg.includes("insufficient") ||
            msg.includes("exceeded") ||
            msg.includes("unauthorized") ||
            msg.includes("401") ||
            msg.includes("403")
        );
    }
    return false;
}