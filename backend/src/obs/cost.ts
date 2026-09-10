import { PRICING } from "../llm";

/** Compute LLM cost in USD from token counts (claude-opus-5 pricing). */
export function llmCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * PRICING.inputPerMTok + outputTokens * PRICING.outputPerMTok) / 1_000_000
  );
}
