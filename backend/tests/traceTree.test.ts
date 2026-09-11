import { describe, expect, test } from "bun:test";
import { formatTraceTree } from "../src/obs/traceTree";

describe("Phase 11 trace tree", () => {
  test("prints the demo shape", () => {
    const tree = formatTraceTree({
      traceId: "abc123",
      llmCalls: [
        {
          purpose: "agent",
          model: "gpt-4o",
          provider: "openai",
          input: "q",
          output: "",
          inputTokens: 10,
          outputTokens: 4,
          latencyMs: 100,
          status: "success",
        },
        {
          purpose: "reasoning",
          model: "gpt-4o",
          provider: "openai",
          input: "q",
          output: "done",
          inputTokens: 20,
          outputTokens: 8,
          latencyMs: 80,
          status: "success",
        },
      ],
      retrievals: [
        {
          query: "FHA overlay",
          topK: 4,
          chunkIds: [1],
          documentIds: [2],
          sourcePaths: ["product-overlays.md"],
          similarityScores: [0.8],
          texts: ["580+"],
          latencyMs: 5,
          status: "success",
        },
      ],
      toolCalls: [
        {
          name: "getMortgageRate",
          arguments: { product: "fha" },
          startedAt: 0,
          endedAt: 1,
          latencyMs: 1,
          result: '{"ratePercent":6.1}',
          status: "success",
        },
      ],
      finalAnswer: "FHA requires 580+; rate is 6.1%.",
    });

    expect(tree).toContain("Trace ID: abc123");
    expect(tree).toContain("Agent");
    expect(tree).toContain("LLM Call");
    expect(tree).toContain("Model: gpt-4o");
    expect(tree).toContain("Retrieval");
    expect(tree).toContain("Query: FHA overlay");
    expect(tree).toContain("Documents: product-overlays.md");
    expect(tree).toContain("Tool Call");
    expect(tree).toContain("Name: getMortgageRate");
    expect(tree).toContain("LLM Reasoning");
    expect(tree).toContain("Final Response");
    expect(tree).toContain("FHA requires 580+");
  });

  test("failure signatures: slow tool, tool error, poor retrieval, LLM timeout", () => {
    const tree = formatTraceTree({
      requestId: "req-123",
      traceId: "trace-456",
      llmCalls: [
        {
          purpose: "agent",
          model: "gpt-4o",
          provider: "openai",
          input: "q",
          output: "",
          inputTokens: 80_000,
          outputTokens: 4,
          latencyMs: 30_000,
          status: "error",
          error: "Request timeout",
        },
      ],
      retrievals: [
        {
          query: "FHA overlay",
          topK: 3,
          chunkIds: [1, 2, 3],
          documentIds: [1, 1, 1],
          sourcePaths: ["a.md", "b.md", "c.md"],
          similarityScores: [0.31, 0.28, 0.24],
          texts: ["x"],
          latencyMs: 5,
          status: "success",
        },
      ],
      toolCalls: [
        {
          name: "getMortgageRate",
          arguments: {},
          startedAt: 0,
          endedAt: 8200,
          latencyMs: 8200,
          result: "Connection refused",
          status: "error",
          error: "Connection refused",
        },
      ],
      finalAnswer: "",
    });

    expect(tree).toContain("Request ID: req-123");
    expect(tree).toContain("Trace ID: trace-456");
    expect(tree).toContain("8.2 sec ⚠️");
    expect(tree).toContain("Status: ERROR");
    expect(tree).toContain("Error: Connection refused");
    expect(tree).toContain("Quality: Poor");
    expect(tree).toContain("Error: Request timeout");
    expect(tree).toContain("Tokens: 80000 in");
  });
});
