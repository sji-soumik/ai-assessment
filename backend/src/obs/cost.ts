import { PRICING } from "../llm";

/** Compute LLM cost in USD from token counts (gpt-4o pricing). */
export function llmCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * PRICING.inputPerMTok + outputTokens * PRICING.outputPerMTok) / 1_000_000
  );
}
