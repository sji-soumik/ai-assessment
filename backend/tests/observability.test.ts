import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { InMemorySpanExporter, type ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { buildGraph } from "../src/agent/graph";
import { SpanName } from "../src/obs/names";
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
    expect(llm.attributes["gen_ai.system"]).toBe("anthropic");
    expect(llm.attributes["gen_ai.request.model"]).toBe("claude-opus-5");
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
});
