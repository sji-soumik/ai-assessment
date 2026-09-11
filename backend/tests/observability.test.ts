import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { InMemorySpanExporter, type ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { buildGraph } from "../src/agent/graph";
import { invokeAgent } from "../src/agent/invoke";
import { SpanName } from "../src/obs/names";
import { register, resetMetrics } from "../src/obs/metrics";
import { flushTelemetry, initTelemetry, shutdownTelemetry } from "../src/obs/otel";
import { withSpan } from "../src/obs/spans";
import { sequenceModel } from "./sequence-model";

const memory = new InMemorySpanExporter();

beforeAll(() => {
  initTelemetry({ exporter: memory, processor: "simple" });
});

afterAll(async () => {
  await shutdownTelemetry();
});

beforeEach(() => {
  memory.reset();
  resetMetrics();
});

function parentName(spans: ReadableSpan[], span: ReadableSpan): string | undefined {
  const parentCtx = span.parentSpanContext;
  if (!parentCtx) return undefined;
  return spans.find((s) => s.spanContext().spanId === parentCtx.spanId)?.name;
}

describe("OpenTelemetry span tree (Phase 6)", () => {
  test("direct answer: agent → llm.call → final.response", async () => {
    const model = sequenceModel([new AIMessage("The base rate is 6.0%.")]);
    const graph = buildGraph(model);

    await withSpan(SpanName.agent, async () => {
      await graph.invoke({ messages: [new HumanMessage("What is the base rate?")] });
    });
    await flushTelemetry();

    const spans = memory.getFinishedSpans();
    const names = spans.map((s) => s.name);
    expect(names).toContain(SpanName.agent);
    expect(names).toContain(SpanName.llmCall);
    expect(names).toContain(SpanName.finalResponse);
    expect(names).not.toContain(SpanName.llmReasoning);

    const root = spans.find((s) => s.name === SpanName.agent)!;
    const llm = spans.find((s) => s.name === SpanName.llmCall)!;
    expect(parentName(spans, llm)).toBe(SpanName.agent);
    expect(root.parentSpanContext).toBeUndefined();
  });

  test("complete flow: agent → llm.call → retrieval → tool.call → llm.reasoning → final.response", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "retrieve", args: { query: "FHA overlay" }, id: "r1" },
          { name: "getMortgageRate", args: { product: "fha", termYears: 30 }, id: "t1" },
        ],
      }),
      new AIMessage("FHA requires 580+ credit; 30-year FHA rate is 6.1%."),
    ]);
    const graph = buildGraph(model);

    await withSpan(SpanName.agent, async () => {
      await graph.invoke({
        messages: [new HumanMessage("FHA overlay and 30-year FHA rate?")],
      });
    });
    await flushTelemetry();

    const spans = memory.getFinishedSpans();
    for (const name of [
      SpanName.agent,
      SpanName.llmCall,
      SpanName.retrieval,
      SpanName.toolCall,
      SpanName.llmReasoning,
      SpanName.finalResponse,
    ]) {
      expect(spans.some((s) => s.name === name)).toBe(true);
    }

    // All operation spans nest under the root agent span.
    for (const span of spans) {
      if (span.name === SpanName.agent) continue;
      expect(parentName(spans, span)).toBe(SpanName.agent);
    }

    // Single trace id across all spans.
    const traceIds = new Set(spans.map((s) => s.spanContext().traceId));
    expect(traceIds.size).toBe(1);
  });

  test("LLM span carries gen_ai attrs (Phase 7)", async () => {
    const model = sequenceModel([new AIMessage("ok")]);
    const graph = buildGraph(model);

    await withSpan(SpanName.agent, async () => {
      await graph.invoke({ messages: [new HumanMessage("hi")] });
    });
    await flushTelemetry();

    const llm = memory.getFinishedSpans().find((s) => s.name === SpanName.llmCall)!;
    expect(llm.attributes["gen_ai.system"]).toBe("openai");
    expect(llm.attributes["gen_ai.request.model"]).toBe("gpt-4o");
    expect(llm.attributes["llm.cost_usd"]).toBeDefined();
  });

  test("tool span carries name and status attrs (Phase 9)", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "getMortgageRate", args: {}, id: "t1" }],
      }),
      new AIMessage("Rate is 6.0%."),
    ]);
    const graph = buildGraph(model);

    await withSpan(SpanName.agent, async () => {
      await graph.invoke({ messages: [new HumanMessage("base rate?")] });
    });
    await flushTelemetry();

    const tool = memory.getFinishedSpans().find((s) => s.name === SpanName.toolCall)!;
    expect(tool.attributes["tool.name"]).toBe("getMortgageRate");
    expect(tool.attributes["tool.status"]).toBe("success");
    expect(tool.attributes["tool.latency_ms"]).toBeDefined();
  });

  test("retrieval span carries query and status attrs (Phase 8)", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "retrieve", args: { query: "FHA overlay" }, id: "r1" },
          { name: "getMortgageRate", args: { product: "fha", termYears: 30 }, id: "t1" },
        ],
      }),
      new AIMessage("FHA requires 580+ credit; 30-year FHA rate is 6.1%."),
    ]);
    const graph = buildGraph(model);

    await withSpan(SpanName.agent, async () => {
      await graph.invoke({
        messages: [new HumanMessage("FHA overlay and 30-year FHA rate?")],
      });
    });
    await flushTelemetry();

    const retrieval = memory.getFinishedSpans().find((s) => s.name === SpanName.retrieval)!;
    expect(retrieval.attributes["retrieval.query"]).toBe("FHA overlay");
    expect(retrieval.attributes["retrieval.document_count"]).toBeDefined();
    expect(retrieval.attributes["retrieval.similarity_scores"]).toBeDefined();
    expect(retrieval.attributes["retrieval.latency_ms"]).toBeDefined();
    expect(retrieval.attributes["retrieval.source_paths"]).toBeDefined();
    expect(retrieval.attributes["retrieval.documents"]).toBeDefined();
    const retrievalStatus = retrieval.attributes["retrieval.status"];
    expect(retrievalStatus === "success" || retrievalStatus === "error").toBe(true);
  });
});

describe("Phase 16 verification (invokeAgent)", () => {
  test("every request generates a trace; LLM, retrieval, and tool each create a span", async () => {
    resetMetrics();
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "retrieve", args: { query: "FHA overlay" }, id: "r1" },
          { name: "getMortgageRate", args: { product: "fha", termYears: 30 }, id: "t1" },
        ],
      }),
      new AIMessage({
        content: "FHA overlay is 580+; 30-year FHA is 6.1%.",
        usage_metadata: { input_tokens: 40, output_tokens: 20, total_tokens: 60 },
      }),
    ]);

    const { requestId, traceId, result } = await invokeAgent("FHA overlay and 30-year FHA rate?", {
      graph: buildGraph(model),
      requestId: "req-verify",
      evaluate: false,
    });
    await flushTelemetry();

    expect(requestId).toBe("req-verify");
    expect(traceId).toBeDefined();

    const spans = memory.getFinishedSpans();
    const names = spans.map((s) => s.name);
    expect(names).toContain(SpanName.agent);
    expect(names).toContain(SpanName.llmCall);
    expect(names).toContain(SpanName.retrieval);
    expect(names).toContain(SpanName.toolCall);
    expect(names).toContain(SpanName.llmReasoning);
    expect(names).toContain(SpanName.finalResponse);

    expect(new Set(spans.map((s) => s.spanContext().traceId)).size).toBe(1);
    expect(spans.every((s) => s.spanContext().traceId === traceId)).toBe(true);
    expect(spans.every((s) => s.attributes["request.id"] === "req-verify")).toBe(true);

    expect(result.llmCalls.some((c) => c.latencyMs >= 0)).toBe(true);
    expect(result.toolCalls[0]!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.retrievals[0]!.latencyMs).toBeGreaterThanOrEqual(0);

    const text = await register.metrics();
    expect(text).toContain("agent_requests_total");
    expect(text).toContain("llm_requests_total");
    expect(text).toContain("tool_requests_total");
    expect(text).toContain("retrieval_requests_total");
  });

  test("token usage and cost are recorded", async () => {
    resetMetrics();
    const model = sequenceModel([
      new AIMessage({
        content: "ok",
        usage_metadata: { input_tokens: 80_000, output_tokens: 10, total_tokens: 80_010 },
      }),
    ]);
    const { result } = await invokeAgent("base rate?", {
      graph: buildGraph(model),
      scenario: "token_heavy",
      chaosOverrides: { tokenPadEnabled: false },
      evaluate: false,
      requestId: "req-tokens",
    });
    await flushTelemetry();

    expect(result.llmCalls[0]!.inputTokens).toBe(80_000);
    const llm = memory.getFinishedSpans().find((s) => s.name === SpanName.llmCall)!;
    expect(llm.attributes["gen_ai.usage.input_tokens"]).toBe(80_000);
    expect(Number(llm.attributes["llm.cost_usd"])).toBeGreaterThan(0);

    const text = await register.metrics();
    expect(text).toContain("llm_input_tokens_total");
    expect(text).toContain("llm_cost_dollars_total");
  });

  test("tool failure is recorded as ERROR without failing the request", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "getMortgageRate", args: {}, id: "t1" }],
      }),
      new AIMessage("I could not get the live rate because the tool failed."),
    ]);
    const { result } = await invokeAgent("What is the current base rate?", {
      graph: buildGraph(model),
      scenario: "tool_failure",
      evaluate: false,
      requestId: "req-tool-fail",
    });
    await flushTelemetry();

    expect(result.finalAnswer.length).toBeGreaterThan(0);
    expect(result.toolCalls[0]!.status).toBe("error");
    expect(result.toolCalls[0]!.error).toBe("Connection refused");

    const tool = memory.getFinishedSpans().find((s) => s.name === SpanName.toolCall)!;
    expect(tool.status.code).toBe(2);
    expect(tool.attributes["tool.status"]).toBe("error");
    expect(tool.attributes["tool.error"]).toBe("Connection refused");
  });

  test("LLM timeout span is ERROR with Request timeout", async () => {
    const boom = sequenceModel([new AIMessage("unused")]);
    boom.invoke = async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };

    await expect(
      invokeAgent("hi", {
        graph: buildGraph(boom),
        scenario: "llm_timeout",
        evaluate: false,
        requestId: "req-to",
      }),
    ).rejects.toThrow("Request timeout");

    await flushTelemetry();
    const llm = memory.getFinishedSpans().find((s) => s.name === SpanName.llmCall)!;
    expect(llm.status.code).toBe(2);
    expect(llm.attributes["llm.error"]).toBe("Request timeout");
    expect(llm.events.some((e) => e.name === "exception")).toBe(true);
  });

  test("bad retrieval span is Quality poor with the canned scores", async () => {
    const model = sequenceModel([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "retrieve", args: { query: "FHA overlay" }, id: "r1" }],
      }),
      new AIMessage("Weak match."),
    ]);
    await invokeAgent("FHA overlay?", {
      graph: buildGraph(model),
      scenario: "bad_retrieval",
      evaluate: false,
      requestId: "req-poor",
    });
    await flushTelemetry();
    const retrieval = memory.getFinishedSpans().find((s) => s.name === SpanName.retrieval)!;
    expect(retrieval.attributes["retrieval.quality"]).toBe("poor");
    expect(retrieval.attributes["retrieval.similarity_scores"]).toBe("[0.31,0.28,0.24]");
  });
});

