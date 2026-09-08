import { describe, expect, test } from "bun:test";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "../src/agent/graph";
import { summarizeFlow } from "../src/agent/flow";
import { toAgentMessage } from "../src/agent/messages";
import { routeAfterLlm } from "../src/agent/nodes";
import type { LLMCallRecord } from "../src/agent/state";
import { sequenceModel } from "./sequence-model";

describe("agent graph (fake model)", () => {
  test("basic conversation: START → agent → respond → END", async () => {
    const model = new FakeListChatModel({ responses: ["The base rate is 4.25% (stub)."] });
    const graph = buildGraph(model);
    const result = await graph.invoke({
      messages: [new HumanMessage("What is the current base rate?")],
    });
    expect(result.finalAnswer).toBe("The base rate is 4.25% (stub).");
    expect(result.messages.at(-1)).toBeInstanceOf(AIMessage);
  });

  test("captures one LLMCallRecord with latency and status", async () => {
    const model = new FakeListChatModel({ responses: ["ok"] });
    const graph = buildGraph(model);
    const result = await graph.invoke({ messages: [new HumanMessage("hi")] });
    expect(result.llmCalls).toHaveLength(1);
    const call = result.llmCalls[0]!;
    expect(call.status).toBe("success");
    expect(call.purpose).toBe("agent");
    expect(call.model).toBe("claude-opus-5");
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
    expect(call.output).toBe("ok");
  });

  test("tool path: agent → tool → reasoning → respond", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "getMortgageRate", args: { term: 30 }, id: "call_1" }],
      }),
      new AIMessage("The 30-year rate is 6.1% based on the tool result (stub)."),
    ]);
    const graph = buildGraph(model);
    const result = await graph.invoke({
      messages: [new HumanMessage("What is the 30-year mortgage rate?")],
    });

    expect(result.finalAnswer).toBe("The 30-year rate is 6.1% based on the tool result (stub).");
    expect(result.llmCalls).toHaveLength(2);
    expect(result.llmCalls[0]!.purpose).toBe("agent");
    expect(result.llmCalls[1]!.purpose).toBe("reasoning");
  });

  test("retrieval path: agent → retrieval → tool → reasoning → respond", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "retrieve", args: { query: "base rate policy" }, id: "call_r1" }],
      }),
      new AIMessage("Policy docs mention a base rate guideline of 4.25% (stub)."),
    ]);
    const graph = buildGraph(model);
    const result = await graph.invoke({
      messages: [new HumanMessage("What does policy say about the base rate?")],
    });

    expect(result.finalAnswer).toBe("Policy docs mention a base rate guideline of 4.25% (stub).");
    expect(result.llmCalls.map((c: LLMCallRecord) => c.purpose)).toEqual(["agent", "reasoning"]);
    expect(result.retrievals).toHaveLength(1);
  });

  test("Phase 5 complete flow: one request runs LLM → retrieval → tool → reasoning → answer", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "retrieve", args: { query: "FHA credit overlay" }, id: "r1" },
          { name: "getMortgageRate", args: { product: "fha", termYears: 30 }, id: "t1" },
        ],
      }),
      new AIMessage(
        "FHA requires a minimum credit score of 580. The current 30-year FHA rate is 6.1%.",
      ),
    ]);
    const graph = buildGraph(model);
    const result = await graph.invoke({
      messages: [
        new HumanMessage("What is the FHA credit overlay and the current 30-year FHA rate?"),
      ],
    });

    const flow = summarizeFlow(result);
    expect(flow.isCompleteFlow).toBe(true);
    expect(flow.steps).toEqual([
      "llm.agent",
      "retrieval",
      "tool.getMortgageRate",
      "llm.reasoning",
      "respond",
    ]);
    expect(result.llmCalls).toHaveLength(2);
    expect(result.retrievals).toHaveLength(1);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("getMortgageRate");
    expect(result.toolCalls[0]!.status).toBe("success");
    expect(result.finalAnswer).toContain("6.1%");
  });

  test("LLM error propagates as a failed request", async () => {
    const model = new FakeListChatModel({ responses: ["unused"] });
    model.invoke = async () => {
      throw new Error("simulated provider outage");
    };
    const graph = buildGraph(model);
    expect(graph.invoke({ messages: [new HumanMessage("hi")] })).rejects.toThrow(
      "simulated provider outage",
    );
  });
});

describe("decision routing", () => {
  test("plain answer → respond", () => {
    expect(
      routeAfterLlm({ messages: [toAgentMessage(new AIMessage("The rate is 4.25%"))] }),
    ).toBe("respond");
  });

  test("getMortgageRate tool call → tool", () => {
    const withTool = new AIMessage({
      content: "",
      tool_calls: [{ name: "getMortgageRate", args: { term: 30 }, id: "call_1" }],
    });
    expect(routeAfterLlm({ messages: [toAgentMessage(withTool)] })).toBe("tool");
  });

  test("retrieve tool call → retrieval", () => {
    const withRetrieval = new AIMessage({
      content: "",
      tool_calls: [{ name: "retrieve", args: { query: "rates" }, id: "call_r1" }],
    });
    expect(routeAfterLlm({ messages: [toAgentMessage(withRetrieval)] })).toBe("retrieval");
  });
});

describe("live LLM (auto-skipped without ANTHROPIC_API_KEY)", () => {
  test.skipIf(!process.env.ANTHROPIC_API_KEY)(
    "Phase 2 acceptance: real answer with real token usage",
    async () => {
      const graph = buildGraph();
      const result = await graph.invoke({
        messages: [new HumanMessage("What is the current base rate?")],
      });
      expect(result.finalAnswer.length).toBeGreaterThan(0);
      const call = result.llmCalls[0]!;
      expect(call.inputTokens).toBeGreaterThan(0);
      expect(call.outputTokens).toBeGreaterThan(0);
      expect(call.latencyMs).toBeGreaterThan(0);
    },
    180_000,
  );

  test.skipIf(!process.env.ANTHROPIC_API_KEY || !process.env.DATABASE_URL)(
    "Phase 5 acceptance: live complete flow with retrieval + tool + reasoning",
    async () => {
      const graph = buildGraph();
      const result = await graph.invoke({
        messages: [
          new HumanMessage(
            "What are the FHA credit score requirements and what is the current 30-year FHA mortgage rate?",
          ),
        ],
      });
      const flow = summarizeFlow(result);
      expect(result.finalAnswer.length).toBeGreaterThan(0);
      expect(flow.isCompleteFlow).toBe(true);
      expect(result.llmCalls.length).toBeGreaterThanOrEqual(2);
      expect(result.retrievals.length).toBeGreaterThan(0);
      expect(result.toolCalls.some((t) => t.name === "getMortgageRate")).toBe(true);
    },
    180_000,
  );
});
