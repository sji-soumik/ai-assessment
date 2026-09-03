import { describe, expect, test } from "bun:test";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "../src/agent/graph";
import { route } from "../src/agent/nodes";

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
    expect(route({ messages: [new AIMessage("The rate is 4.25%")] })).toBe("respond");
  });

  test("tool_calls present → tools", () => {
    const withTool = new AIMessage({
      content: "",
      tool_calls: [{ name: "getMortgageRate", args: { term: 30 }, id: "call_1" }],
    });
    expect(route({ messages: [withTool] })).toBe("tools");
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
});
