import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

/** Groq client for draft generation (uses GPT-OSS 120B). */
export const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

/** Groq client for classification (uses small fast model). */
export const groqClassify = new Groq({
    apiKey: process.env.GROQ_CLASSIFY_KEY ?? process.env.GROQ_API_KEY,
});

/** Model used for classification. Default: openai/gpt-oss-20b (reasoning model) */
export const GROQ_CLASSIFY_MODEL =
    process.env.GROQ_CLASSIFY_MODEL ?? "openai/gpt-oss-20b";