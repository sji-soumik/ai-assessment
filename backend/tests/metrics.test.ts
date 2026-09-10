import { beforeEach, describe, expect, test } from "bun:test";
import {
  BAD_RETRIEVAL_THRESHOLD,
  isLlmTimeout,
  recordAgentRequest,
  recordGroundedness,
  recordLlmCall,
  recordRetrieval,
  recordToolCall,
  register,
  resetMetrics,
  sanitizeUserId,
} from "../src/obs/metrics";
import type { LLMCallRecord, RetrievalRecord, ToolCallRecord } from "../src/agent/state";

const SPEC_METRIC_NAMES = [
  "agent_requests_total",
  "agent_request_duration_seconds",
  "llm_requests_total",
  "llm_latency_seconds",
  "llm_input_tokens_total",
  "llm_output_tokens_total",
  "llm_cost_dollars_total",
  "llm_timeouts_total",
  "tool_requests_total",
  "tool_latency_seconds",
  "tool_errors_total",
  "retrieval_requests_total",
  "retrieval_latency_seconds",
  "retrieval_similarity",
  "retrieval_below_threshold_total",
  "agent_cost_dollars_total",
  "agent_groundedness_total",
];

function llm(overrides: Partial<LLMCallRecord> = {}): LLMCallRecord {
  return {
    purpose: "agent",
    model: "claude-opus-5",
    provider: "anthropic",
    input: "hi",
    output: "hello",
    inputTokens: 10,
    outputTokens: 4,
    latencyMs: 1200,
    status: "success",
    ...overrides,
  };
}

function retrieval(overrides: Partial<RetrievalRecord> = {}): RetrievalRecord {
  return {
    query: "FHA overlay",
    topK: 4,
    chunkIds: [1],
    documentIds: [2],
    sourcePaths: ["product-overlays.md"],
    similarityScores: [0.8],
    texts: ["FHA requires 580+"],
    latencyMs: 20,
    status: "success",
    ...overrides,
  };
}

function tool(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    name: "getMortgageRate",
    arguments: { product: "fha" },
    startedAt: 0,
    endedAt: 1,
    latencyMs: 2,
    result: '{"ratePercent":6.1}',
    status: "success",
    ...overrides,
  };
}

describe("Prometheus metrics (Phase 12)", () => {
  beforeEach(() => {
    resetMetrics();
  });

  test("sanitizeUserId is bounded", () => {
    expect(sanitizeUserId("alice")).toBe("alice");
    expect(sanitizeUserId("frontend")).toBe("frontend");
    expect(sanitizeUserId("cli")).toBe("cli");
    expect(sanitizeUserId("user with spaces")).toBe("anonymous");
    expect(sanitizeUserId("x".repeat(33))).toBe("anonymous");
    expect(sanitizeUserId(undefined)).toBe("anonymous");
    expect(sanitizeUserId("drop;table")).toBe("anonymous");
  });

  test("isLlmTimeout detects abort/timeout errors", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(isLlmTimeout(abort)).toBe(true);
    expect(isLlmTimeout(new Error("Request timed out"))).toBe(true);
    expect(isLlmTimeout(new Error("connection refused"))).toBe(false);
  });

  test("/metrics text includes every SPEC name after a full record", async () => {
    recordAgentRequest({ user: "alice", status: "success", durationSeconds: 1.5, costUsd: 0.002 });
    recordLlmCall(llm());
    recordLlmCall(llm({ purpose: "reasoning", status: "error", inputTokens: 0, outputTokens: 0 }), true);
    recordToolCall(tool());
    recordToolCall(tool({ status: "error", result: "nope", error: "nope" }));
    recordRetrieval(retrieval());
    recordRetrieval(retrieval({ similarityScores: [0.2], texts: ["noise"] }));
    recordGroundedness("grounded");

    const text = await register.metrics();
    for (const name of SPEC_METRIC_NAMES) {
      expect(text).toContain(name);
    }
    expect(text).toContain('user="alice"');
    expect(text).toContain("llm_timeouts_total");
    expect(BAD_RETRIEVAL_THRESHOLD).toBe(0.35);
  });

  test("bad retrieval increments below-threshold when max score is low", async () => {
    recordRetrieval(retrieval({ similarityScores: [0.22, 0.18] }));
    const text = await register.metrics();
    expect(text).toMatch(/retrieval_below_threshold_total\s+1/);
  });

  test("good retrieval does not increment below-threshold", async () => {
    recordRetrieval(retrieval({ similarityScores: [0.81] }));
    const text = await register.metrics();
    expect(text).toMatch(/retrieval_below_threshold_total\s+0/);
  });
});
