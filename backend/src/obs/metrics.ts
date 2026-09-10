import { Counter, Histogram, Registry } from "prom-client";
import { llmCostUsd } from "./cost";
import type { LLMCallRecord, RetrievalRecord, ToolCallRecord } from "../agent/state";

/** Dedicated registry so /metrics stays agent-focused (no default process metrics). */
export const register = new Registry();

/** Max cosine similarity below this counts as a bad retrieval (P14 band is ~0.2–0.3). */
export const BAD_RETRIEVAL_THRESHOLD = 0.35;

const USER_ID_RE = /^[a-zA-Z0-9_-]{1,32}$/;

/** Coerce free-text user ids to a bounded label. Invalid values become `anonymous`. */
export function sanitizeUserId(raw: unknown): string {
  if (typeof raw !== "string" || !USER_ID_RE.test(raw)) return "anonymous";
  return raw;
}

export function isLlmTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    err.name === "APIUserAbortError" ||
    err.name === "APIConnectionTimeoutError"
  ) {
    return true;
  }
  const msg = err.message.toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborted");
}

export const agentRequestsTotal = new Counter({
  name: "agent_requests_total",
  help: "Total agent /chat (or CLI) requests",
  labelNames: ["status", "user"] as const,
  registers: [register],
});

export const agentRequestDurationSeconds = new Histogram({
  name: "agent_request_duration_seconds",
  help: "End-to-end agent request duration in seconds",
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const agentCostDollarsTotal = new Counter({
  name: "agent_cost_dollars_total",
  help: "Cumulative LLM cost in USD attributed to agent requests",
  labelNames: ["user"] as const,
  registers: [register],
});

export const llmRequestsTotal = new Counter({
  name: "llm_requests_total",
  help: "LLM calls made by the agent (excludes the groundedness judge)",
  labelNames: ["purpose", "status"] as const,
  registers: [register],
});

export const llmLatencySeconds = new Histogram({
  name: "llm_latency_seconds",
  help: "LLM call latency in seconds",
  labelNames: ["purpose", "status"] as const,
  buckets: [0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const llmInputTokensTotal = new Counter({
  name: "llm_input_tokens_total",
  help: "Cumulative LLM input tokens",
  registers: [register],
});

export const llmOutputTokensTotal = new Counter({
  name: "llm_output_tokens_total",
  help: "Cumulative LLM output tokens",
  registers: [register],
});

export const llmCostDollarsTotal = new Counter({
  name: "llm_cost_dollars_total",
  help: "Cumulative LLM cost in USD (agent + reasoning calls only)",
  registers: [register],
});

export const llmTimeoutsTotal = new Counter({
  name: "llm_timeouts_total",
  help: "LLM calls that failed due to timeout / abort",
  registers: [register],
});

export const toolRequestsTotal = new Counter({
  name: "tool_requests_total",
  help: "Non-retrieval tool invocations",
  labelNames: ["name", "status"] as const,
  registers: [register],
});

export const toolLatencySeconds = new Histogram({
  name: "tool_latency_seconds",
  help: "Tool call latency in seconds",
  labelNames: ["name"] as const,
  buckets: [0.001, 0.01, 0.1, 1, 5, 10, 30],
  registers: [register],
});

export const toolErrorsTotal = new Counter({
  name: "tool_errors_total",
  help: "Tool calls that returned an error",
  labelNames: ["name"] as const,
  registers: [register],
});

export const retrievalRequestsTotal = new Counter({
  name: "retrieval_requests_total",
  help: "Knowledge-base retrievals",
  labelNames: ["status"] as const,
  registers: [register],
});

export const retrievalLatencySeconds = new Histogram({
  name: "retrieval_latency_seconds",
  help: "Retrieval latency in seconds",
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const retrievalSimilarity = new Histogram({
  name: "retrieval_similarity",
  help: "Per-hit cosine similarity scores from retrieval",
  buckets: [0.1, 0.2, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  registers: [register],
});

export const retrievalBelowThresholdTotal = new Counter({
  name: "retrieval_below_threshold_total",
  help: `Retrievals whose max similarity is below ${BAD_RETRIEVAL_THRESHOLD}`,
  registers: [register],
});

export const agentGroundednessTotal = new Counter({
  name: "agent_groundedness_total",
  help: "LLM-as-judge groundedness verdicts (evaluation-derived; not a runtime heuristic)",
  labelNames: ["verdict"] as const,
  registers: [register],
});

export function recordLlmCall(record: LLMCallRecord, timedOut = false): void {
  const labels = { purpose: record.purpose, status: record.status };
  llmRequestsTotal.inc(labels);
  llmLatencySeconds.observe(labels, record.latencyMs / 1000);
  if (record.inputTokens > 0) llmInputTokensTotal.inc(record.inputTokens);
  if (record.outputTokens > 0) llmOutputTokensTotal.inc(record.outputTokens);
  const cost = llmCostUsd(record.inputTokens, record.outputTokens);
  if (cost > 0) llmCostDollarsTotal.inc(cost);
  if (timedOut) llmTimeoutsTotal.inc();
}

export function recordToolCall(record: ToolCallRecord): void {
  const name = record.name || "unknown";
  toolRequestsTotal.inc({ name, status: record.status });
  toolLatencySeconds.observe({ name }, record.latencyMs / 1000);
  if (record.status === "error") toolErrorsTotal.inc({ name });
}

export function recordRetrieval(record: RetrievalRecord): void {
  retrievalRequestsTotal.inc({ status: record.status });
  retrievalLatencySeconds.observe(record.latencyMs / 1000);
  for (const score of record.similarityScores) {
    retrievalSimilarity.observe(score);
  }
  if (record.status === "success") {
    const maxScore = record.similarityScores.length > 0 ? Math.max(...record.similarityScores) : 0;
    if (maxScore < BAD_RETRIEVAL_THRESHOLD) retrievalBelowThresholdTotal.inc();
  }
}

export function recordAgentRequest(input: {
  user: string;
  status: "success" | "error";
  durationSeconds: number;
  costUsd: number;
}): void {
  const user = sanitizeUserId(input.user);
  agentRequestsTotal.inc({ status: input.status, user });
  agentRequestDurationSeconds.observe(input.durationSeconds);
  if (input.costUsd > 0) agentCostDollarsTotal.inc({ user }, input.costUsd);
}

export function recordGroundedness(verdict: "grounded" | "ungrounded" | "error"): void {
  agentGroundednessTotal.inc({ verdict });
}

export function resetMetrics(): void {
  register.resetMetrics();
}
