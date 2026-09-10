// One-shot CLI conversation: bun run chat "What is the current base rate?"
import { HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "./agent/graph";
import { summarizeFlow } from "./agent/flow";
import { flushTelemetry, initTelemetry, shutdownTelemetry } from "./obs/otel";
import { SpanName } from "./obs/names";
import { withSpan } from "./obs/spans";

initTelemetry();

const question = process.argv.slice(2).join(" ").trim() || "What is the current base rate?";
const graph = buildGraph();

console.log(`User: ${question}\n`);
const started = performance.now();

let traceId: string | undefined;

const result = await withSpan(SpanName.agent, async (span) => {
  span.setAttribute("user.message.length", question.length);
  traceId = span.spanContext().traceId;
  return graph.invoke({ messages: [new HumanMessage(question)] });
});

const flow = summarizeFlow(result);
console.log(`Agent: ${result.finalAnswer}\n`);

if (traceId) console.log(`traceId: ${traceId}`);

console.log(`--- flow (Phase 5) ---`);
console.log(`steps: ${flow.steps.join(" → ")}`);
console.log(
  `operations: ${flow.llmCallCount} LLM, ${flow.retrievalCount} retrieval, ${flow.toolCallCount} tool${flow.isCompleteFlow ? " (complete flow)" : ""}`,
);

console.log("--- LLM calls (Phase 2) ---");
for (const c of result.llmCalls) {
  console.log(
    `${c.purpose}: model=${c.model} provider=${c.provider} tokens=${c.inputTokens}->${c.outputTokens} latency=${c.latencyMs}ms status=${c.status}${c.error ? ` error=${c.error}` : ""}`,
  );
}

if (result.retrievals.length > 0) {
  console.log("--- retrievals (Phase 3) ---");
  for (const r of result.retrievals) {
    console.log(
      `query="${r.query}" topK=${r.topK} docs=[${r.documentIds.join(",")}] scores=[${r.similarityScores.join(",")}] latency=${r.latencyMs}ms status=${r.status}${r.error ? ` error=${r.error}` : ""}`,
    );
  }
}

if (result.toolCalls.length > 0) {
  console.log("--- tool calls (Phase 4) ---");
  for (const t of result.toolCalls) {
    console.log(
      `${t.name}(${JSON.stringify(t.arguments)}) -> ${t.result} latency=${t.latencyMs}ms status=${t.status}${t.error ? ` error=${t.error}` : ""}`,
    );
  }
}

console.log(`total: ${Math.round(performance.now() - started)}ms`);

await flushTelemetry();
await shutdownTelemetry();
