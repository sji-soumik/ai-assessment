import { ChatAnthropic } from "@langchain/anthropic";

export const MODEL_ID = "claude-opus-5";
export const PROVIDER = "anthropic" as const;

/** $/1M tokens for claude-opus-5 (used from Phase 7 for cost attribution). */
export const PRICING = { inputPerMTok: 5.0, outputPerMTok: 25.0 };

/**
 * Single construction point for the LLM.
 * NOTE: never set temperature/top_p/top_k — sampling params are removed on
 * claude-opus-5 and the API rejects them with a 400. `thinking` stays unset
 * (adaptive is the model default).
 */
export function makeModel(options: { maxTokens?: number; timeoutMs?: number; maxRetries?: number } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key (Bun loads .env automatically).",
    );
  }
  return new ChatAnthropic({
    model: MODEL_ID,
    maxTokens: options.maxTokens ?? 2048,
    // Production default: 30s. Chaos (Phase 14) lowers this to force timeouts.
    clientOptions: { timeout: options.timeoutMs ?? 30_000 },
    maxRetries: options.maxRetries ?? 2,
  });
}
