import { BAD_RETRIEVAL_THRESHOLD } from "./obs/metrics";
import { currentRequestContext } from "./obs/requestContext";

export const CHAOS_SCENARIOS = [
  "slow_tool",
  "tool_failure",
  "bad_retrieval",
  "token_heavy",
  "llm_timeout",
] as const;

export type ChaosScenario = (typeof CHAOS_SCENARIOS)[number];

export interface ChaosOverrides {
  toolDelayMs?: number;
  llmTimeoutMs?: number;
  /** When false, skip the 80k-token pad (tests stub usage instead). */
  tokenPadEnabled?: boolean;
}

export const SLOW_TOOL_DELAY_MS = 8_000;
export const SLOW_TOOL_WARN_MS = 5_000;
export const BAD_RETRIEVAL_SCORES = [0.31, 0.28, 0.24] as const;
export const TOKEN_HEAVY_TARGET_TOKENS = 80_000;
export const LLM_TIMEOUT_MS = 1;
export const TOOL_CONNECTION_REFUSED = "Connection refused";
export const LLM_TIMEOUT_MESSAGE = "Request timeout";

const SCENARIO_SET = new Set<string>(CHAOS_SCENARIOS);

export function isChaosScenario(raw: unknown): raw is ChaosScenario {
  return typeof raw === "string" && SCENARIO_SET.has(raw);
}

/** `undefined` if omitted/empty; throws if a non-empty value is not a known scenario. */
export function parseScenario(raw: unknown): ChaosScenario | undefined {
  if (raw == null || raw === "") return undefined;
  if (isChaosScenario(raw)) return raw;
  throw new Error(
    `unknown scenario "${String(raw)}". Expected one of: ${CHAOS_SCENARIOS.join(", ")}`,
  );
}

export function currentScenario(): ChaosScenario | undefined {
  return currentRequestContext()?.scenario;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Slow tool (8s) and connection-refused faults. No-op when chaos is off.
 * Applied at the getMortgageRate lookup seam (see ADR 0001).
 */
export async function applyToolChaos(): Promise<void> {
  const ctx = currentRequestContext();
  if (ctx?.scenario === "slow_tool") {
    await sleep(ctx.chaosOverrides?.toolDelayMs ?? SLOW_TOOL_DELAY_MS);
  }
  if (ctx?.scenario === "tool_failure") {
    throw new Error(TOOL_CONNECTION_REFUSED);
  }
}

/** True when this request should return the canned poor-similarity band. */
export function isBadRetrievalChaos(): boolean {
  return currentRequestContext()?.scenario === "bad_retrieval";
}

/**
 * ~80k-token filler appended to the agent system prompt. Tests can disable
 * the live pad via `chaosOverrides.tokenPadEnabled = false`.
 */
export function tokenHeavyPadding(): string | undefined {
  const ctx = currentRequestContext();
  if (ctx?.scenario !== "token_heavy") return undefined;
  if (ctx.chaosOverrides?.tokenPadEnabled === false) return undefined;
  // " PAD" is 4 chars ≈ 1 token, so 80k repeats ≈ 80k tokens.
  return " PAD".repeat(TOKEN_HEAVY_TARGET_TOKENS);
}

export function chaosLlmTimeoutMs(): number | undefined {
  const ctx = currentRequestContext();
  if (ctx?.scenario !== "llm_timeout") return undefined;
  return ctx.chaosOverrides?.llmTimeoutMs ?? LLM_TIMEOUT_MS;
}

export function retrievalQuality(scores: number[]): "poor" | "ok" {
  if (scores.length === 0) return "poor";
  return Math.max(...scores) < BAD_RETRIEVAL_THRESHOLD ? "poor" : "ok";
}
