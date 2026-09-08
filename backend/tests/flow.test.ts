import { describe, expect, test } from "bun:test";
import { summarizeFlow } from "../src/agent/flow";
import type { AgentState } from "../src/agent/state";

describe("summarizeFlow", () => {
  test("direct answer: agent LLM → respond only", () => {
    const flow = summarizeFlow({
      llmCalls: [{ purpose: "agent" } as AgentState["llmCalls"][0]],
      retrievals: [],
      toolCalls: [],
      finalAnswer: "Hello.",
    });
    expect(flow.steps).toEqual(["llm.agent", "respond"]);
    expect(flow.isCompleteFlow).toBe(false);
  });

  test("tool-only path", () => {
    const flow = summarizeFlow({
      llmCalls: [
        { purpose: "agent" } as AgentState["llmCalls"][0],
        { purpose: "reasoning" } as AgentState["llmCalls"][0],
      ],
      retrievals: [],
      toolCalls: [{ name: "getMortgageRate" } as AgentState["toolCalls"][0]],
      finalAnswer: "6.0%",
    });
    expect(flow.steps).toEqual(["llm.agent", "tool.getMortgageRate", "llm.reasoning", "respond"]);
    expect(flow.isCompleteFlow).toBe(false);
  });

  test("Phase 5 complete flow: LLM → retrieval → tool → reasoning → respond", () => {
    const flow = summarizeFlow({
      llmCalls: [
        { purpose: "agent" } as AgentState["llmCalls"][0],
        { purpose: "reasoning" } as AgentState["llmCalls"][0],
      ],
      retrievals: [{} as AgentState["retrievals"][0]],
      toolCalls: [{ name: "getMortgageRate" } as AgentState["toolCalls"][0]],
      finalAnswer: "FHA overlay is 580+; rate is 6.1%.",
    });
    expect(flow.steps).toEqual([
      "llm.agent",
      "retrieval",
      "tool.getMortgageRate",
      "llm.reasoning",
      "respond",
    ]);
    expect(flow.isCompleteFlow).toBe(true);
    expect(flow.llmCallCount).toBe(2);
    expect(flow.retrievalCount).toBe(1);
    expect(flow.toolCallCount).toBe(1);
  });
});
