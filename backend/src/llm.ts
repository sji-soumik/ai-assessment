import { ChatOpenAI } from "@langchain/openai";

export const MODEL_ID = "gpt-4o";
export const PROVIDER = "openai" as const;

/** $/1M tokens for gpt-4o (used from Phase 7 for cost attribution). */
export const PRICING = { inputPerMTok: 2.5, outputPerMTok: 10.0 };

/** Single construction point for the LLM. */
export function makeModel(options: { maxTokens?: number; timeoutMs?: number; maxRetries?: number } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Copy .env.example to .env and add your key (Bun loads .env automatically).",
    );
  }
  return new ChatOpenAI({
    model: MODEL_ID,
    maxTokens: options.maxTokens ?? 2048,
    // Production default: 30s. Chaos (Phase 14) lowers this to force timeouts.
    timeout: options.timeoutMs ?? 30_000,
    maxRetries: options.maxRetries ?? 2,
  });
}
