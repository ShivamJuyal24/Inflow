/**
 * Compare Classifiers Script
 *
 * Usage: npx tsx scripts/compareClassifiers.ts <path-to-labeled-emails.json>
 *
 * The JSON file should contain an array of emails with expected categories:
 * [
 *   { "from": "sender@example.com", "subject": "Test", "body": "Hello", "expectedCategory": "REQUIRES_REPLY" },
 *   ...
 * ]
 *
 * Runs the Groq classifier against the labeled emails and prints accuracy + mismatches.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

import { cleanEmailBody } from "../src/graph/jevClassifier.js";
import { classifyWithGroq } from "../src/graph/groqClassifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface LabeledEmail {
    from: string;
    subject: string;
    body: string;
    expectedCategory: string;
}

interface Result {
    email: LabeledEmail;
    predicted: string;
    correct: boolean;
    tokensUsed: number;
}

function printUsage(): void {
    console.log(`
Usage: npx tsx scripts/compareClassifiers.ts <path-to-labeled-emails.json>

The JSON file should contain an array of objects with:
- from: string
- subject: string  
- body: string
- expectedCategory: one of SPAM, LOW_PRIORITY, INFORMATIONAL, REQUIRES_REPLY, MEETING, IMPORTANT

Example:
[
  { "from": "sender@example.com", "subject": "Meeting tomorrow", "body": "Let's meet at 3pm", "expectedCategory": "MEETING" },
  { "from": "promo@shop.com", "subject": "50% off sale!", "body": "Buy now...", "expectedCategory": "LOW_PRIORITY" }
]
`);
    process.exit(1);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        printUsage();
    }

    const filePath = join(process.cwd(), args[0]);
    let emails: LabeledEmail[];

    try {
        const content = readFileSync(filePath, "utf-8");
        emails = JSON.parse(content);
    } catch (err: any) {
        console.error(`Failed to read/parse ${filePath}:`, err.message);
        process.exit(1);
    }

    if (!Array.isArray(emails) || emails.length === 0) {
        console.error("JSON must be a non-empty array of emails");
        process.exit(1);
    }

    const validCategories = ["SPAM", "LOW_PRIORITY", "INFORMATIONAL", "REQUIRES_REPLY", "MEETING", "IMPORTANT"];
    for (const [i, email] of emails.entries()) {
        if (!email.from || !email.subject || !email.body || !email.expectedCategory) {
            console.error(`Email at index ${i} missing required fields`);
            process.exit(1);
        }
        if (!validCategories.includes(email.expectedCategory)) {
            console.error(`Email at index ${i} has invalid expectedCategory: ${email.expectedCategory}`);
            process.exit(1);
        }
    }

    console.log(`Loaded ${emails.length} labeled emails`);
    console.log(`Classifier: Groq (${process.env.GROQ_CLASSIFY_MODEL ?? "llama-3.1-8b-instant"})`);
    console.log("─".repeat(60));

    const results: Result[] = [];
    let totalTokens = 0;

    for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const cleanedBody = cleanEmailBody(email.body);

        try {
            const { category, tokensUsed } = await classifyWithGroq(
                { id: `test-${i}`, from: email.from, to: "me@example.com", subject: email.subject, body: email.body },
                cleanedBody
            );

            const correct = category === email.expectedCategory;
            results.push({ email, predicted: category, correct, tokensUsed });
            totalTokens += tokensUsed;

            const status = correct ? "✓" : "✗";
            console.log(`${status} [${i + 1}/${emails.length}] Expected: ${email.expectedCategory.padEnd(16)} Got: ${category} (${tokensUsed} tokens)`);

            if (!correct) {
                console.log(`   Subject: ${email.subject}`);
                console.log(`   From: ${email.from}`);
            }
        } catch (err: any) {
            console.error(`✗ [${i + 1}/${emails.length}] ERROR: ${err.message}`);
            results.push({ email, predicted: "ERROR", correct: false, tokensUsed: 0 });
        }

        // Small delay to avoid rate limits
        if (i < emails.length - 1) {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }

    const correct = results.filter((r) => r.correct).length;
    const accuracy = (correct / emails.length) * 100;

    console.log("─".repeat(60));
    console.log(`\nSUMMARY:`);
    console.log(`  Total emails: ${emails.length}`);
    console.log(`  Correct: ${correct}`);
    console.log(`  Accuracy: ${accuracy.toFixed(1)}%`);
    console.log(`  Total tokens: ${totalTokens}`);
    console.log(`  Avg tokens/email: ${(totalTokens / emails.length).toFixed(0)}`);

    const mismatches = results.filter((r) => !r.correct);
    if (mismatches.length > 0) {
        console.log(`\nMISMATCHES (${mismatches.length}):`);
        for (const m of mismatches) {
            console.log(`  Expected: ${m.email.expectedCategory.padEnd(16)} | Got: ${m.predicted} | Subject: ${m.email.subject}`);
        }
    }

    // Per-category breakdown
    console.log("\nPER-CATEGORY BREAKDOWN:");
    for (const cat of validCategories) {
        const catResults = results.filter((r) => r.email.expectedCategory === cat);
        if (catResults.length === 0) continue;
        const catCorrect = catResults.filter((r) => r.correct).length;
        console.log(`  ${cat.padEnd(16)}: ${catCorrect}/${catResults.length} (${(catCorrect / catResults.length * 100).toFixed(0)}%)`);
    }
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});