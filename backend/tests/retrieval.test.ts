import { describe, expect, test } from "bun:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "../src/agent/graph";
import { invokeAgent } from "../src/agent/invoke";
import { BAD_RETRIEVAL_SCORES, parseScenario, retrievalQuality } from "../src/chaos";
import { BAD_RETRIEVAL_THRESHOLD, recordRetrieval, register, resetMetrics } from "../src/obs/metrics";
import { runWithRequestContextAsync } from "../src/obs/requestContext";
import { similaritySearch } from "../src/rag/search";
import { sequenceModel } from "./sequence-model";

describe("retrieval quality helper", () => {
  test("parseScenario accepts known names and rejects unknown", () => {
    expect(parseScenario(undefined)).toBeUndefined();
    expect(parseScenario("")).toBeUndefined();
    expect(parseScenario("bad_retrieval")).toBe("bad_retrieval");
    expect(() => parseScenario("explode")).toThrow(/unknown scenario/);
  });

  test("scores in the 0.2–0.3 band are poor", () => {
    expect(retrievalQuality([...BAD_RETRIEVAL_SCORES])).toBe("poor");
    expect(BAD_RETRIEVAL_THRESHOLD).toBe(0.35);
  });

  test("high similarity is ok", () => {
    expect(retrievalQuality([0.81, 0.6])).toBe("ok");
  });
});

describe("Phase 14 bad_retrieval chaos", () => {
  test("similaritySearch returns 0.31 / 0.28 / 0.24 without needing Postgres", async () => {
    const hits = await runWithRequestContextAsync(
      { requestId: "req-bad", scenario: "bad_retrieval" },
      () => similaritySearch("FHA credit overlay"),
    );
    expect(hits.map((h) => h.score)).toEqual([0.31, 0.28, 0.24]);
    expect(hits).toHaveLength(3);
  });

  test("graph retrieval span/record carries poor scores", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "retrieve", args: { query: "FHA overlay" }, id: "r1" }],
      }),
      new AIMessage("I could not find a strong policy match."),
    ]);
    const { result } = await invokeAgent("What is the FHA credit overlay?", {
      graph: buildGraph(model),
      scenario: "bad_retrieval",
      evaluate: false,
      requestId: "req-bad-graph",
    });
    expect(result.retrievals).toHaveLength(1);
    expect(result.retrievals[0]!.similarityScores).toEqual([0.31, 0.28, 0.24]);
    expect(retrievalQuality(result.retrievals[0]!.similarityScores)).toBe("poor");
  });

  test("poor scores increment retrieval_below_threshold_total", async () => {
    resetMetrics();
    recordRetrieval({
      query: "x",
      topK: 3,
      chunkIds: [1, 2, 3],
      documentIds: [1, 1, 1],
      sourcePaths: ["a.md", "b.md", "c.md"],
      similarityScores: [0.31, 0.28, 0.24],
      texts: ["a", "b", "c"],
      latencyMs: 4,
      status: "success",
    });
    const text = await register.metrics();
    expect(text).toMatch(/retrieval_below_threshold_total\s+1/);
  });
});

describe("retrieval node without chaos (happy path still works)", () => {
  test("retrieve tool call still produces a retrieval record", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "retrieve", args: { query: "base rate policy" }, id: "r1" }],
      }),
      new AIMessage("Policy mentions the base rate guideline."),
    ]);
    const graph = buildGraph(model);
    const result = await graph.invoke({
      messages: [new HumanMessage("What does policy say about the base rate?")],
    });
    expect(result.retrievals).toHaveLength(1);
    expect(result.retrievals[0]!.query).toBe("base rate policy");
  });
});
