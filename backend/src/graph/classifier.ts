/**
 * Classifier coordinator: manages classifier order, fallback, and circuit breakers.
 */

import type { JevCategory } from "./jevClassifier.js";
import { CATEGORY_DETAILS } from "./jevClassifier.js";
import { classifyWithGroq, isQuotaError as isGroqQuotaError } from "./groqClassifier.js";
import { classifyWithJev, isQuotaError as isJevQuotaError } from "./jevClassifier.js";

export type ClassifierName = "groq" | "jev" | "rules";

export interface ClassifierResult {
    category: JevCategory;
    classifierModel: ClassifierName;
    tokensUsed?: number;
}

export interface ClassifierError extends Error {
    status?: number;
    isQuotaError?: boolean;
}

/** In-memory circuit breaker state for the current run. */
const circuitBreakers = new Set<ClassifierName>();

/** Reset circuit breakers (call at start of each run). */
export function resetCircuitBreakers(): void {
    circuitBreakers.clear();
}

/** Check if a classifier is circuit-open. */
export function isCircuitOpen(name: ClassifierName): boolean {
    return circuitBreakers.has(name);
}

/** Open circuit for a classifier. */
export function openCircuit(name: ClassifierName): void {
    circuitBreakers.add(name);
    console.warn(`Circuit breaker OPEN for classifier: ${name}`);
}

/** Parse CLASSIFIER_ORDER env var. Default: groq,jev */
export function getClassifierOrder(): ClassifierName[] {
    const raw = process.env.CLASSIFIER_ORDER?.trim().toLowerCase() ?? "groq,jev";
    const order = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is ClassifierName =>
            ["groq", "jev", "rules"].includes(s)
        );
    return order.length > 0 ? order : ["groq", "jev"];
}

/**
 * Classify an email using the configured classifier order with fallback.
 * Returns the first successful classification.
 */
export async function classifyWithFallback(
    email: {
        id: string;
        from: string;
        to: string;
        subject: string;
        body: string;
    },
    cleanedBody: string
): Promise<ClassifierResult> {
    const order = getClassifierOrder();
    let lastError: ClassifierError | null = null;

    for (const name of order) {
        if (isCircuitOpen(name)) {
            console.log(`Skipping ${name} (circuit open)`);
            continue;
        }

        try {
            if (name === "groq") {
                // Check if Groq API key is available
                if (!process.env.GROQ_CLASSIFY_KEY && !process.env.GROQ_API_KEY) {
                    console.log("Groq classifier skipped: no GROQ_CLASSIFY_KEY or GROQ_API_KEY");
                    continue;
                }
                const { category, tokensUsed } = await classifyWithGroq(email, cleanedBody);
                return { category, classifierModel: "groq", tokensUsed };
            } else if (name === "jev") {
                // Check if Jev API key is available
                if (!process.env.JEVMODEL_API_KEY) {
                    console.log("Jev classifier skipped: no JEVMODEL_API_KEY");
                    continue;
                }
                const category = await classifyWithJev(email, cleanedBody);
                return { category, classifierModel: "jev" };
            }
            // "rules" is handled separately in classifyNode before LLM calls
        } catch (error: any) {
            lastError = error;
            const isQuota = name === "groq"
                ? isGroqQuotaError(error)
                : name === "jev"
                ? isJevQuotaError(error)
                : false;

            if (isQuota) {
                openCircuit(name);
                console.warn(`${name} quota/auth error — circuit opened, trying next classifier`);
            } else {
                console.error(`${name} classification failed for ${email.id}:`, error.message);
            }
        }
    }

    // All classifiers failed or were skipped
    throw lastError ?? new Error("No classifiers available or all failed");
}

/**
 * Persist classification result to Supabase.
 */
export async function persistClassification(
    supabase: any,
    email: { id: string },
    googleAccountId: string,
    result: ClassifierResult
): Promise<void> {
    const details = CATEGORY_DETAILS[result.category];

    const classification = {
        messageId: email.id,
        category: result.category,
        reason: details.reason,
        suggested_action: details.suggested_action,
    };

    const { data: updatedRows, error: updateError } = await supabase
        .from("emails")
        .update({
            category: classification.category,
            classification_reason: classification.reason,
            suggested_action: classification.suggested_action,
            classified_at: new Date().toISOString(),
            classifier_model: result.classifierModel,
        })
        .eq("message_id", email.id)
        .eq("google_account_id", googleAccountId)
        .select("message_id");

    if (updateError) {
        throw new Error(`Failed to persist classification: ${updateError.message}`);
    }

    if (!updatedRows || updatedRows.length === 0) {
        throw new Error("Failed to persist classification: no matching email row was updated");
    }

    console.log(`Persisted classification for ${email.id} via ${result.classifierModel}: ${result.category}`);
}