// One-shot CLI conversation: bun run chat "What is the current base rate?"
import { HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "./agent/graph";

const question = process.argv.slice(2).join(" ").trim() || "What is the current base rate?";
const graph = buildGraph();

console.log(`User: ${question}\n`);
const started = performance.now();
const result = await graph.invoke({ messages: [new HumanMessage(question)] });
console.log(`Agent: ${result.finalAnswer}\n`);

console.log("--- internal capture (Phase 2) ---");
for (const c of result.llmCalls) {
  console.log(
    `${c.purpose}: model=${c.model} provider=${c.provider} tokens=${c.inputTokens}->${c.outputTokens} latency=${c.latencyMs}ms status=${c.status}${c.error ? ` error=${c.error}` : ""}`,
  );
}
console.log(`total: ${Math.round(performance.now() - started)}ms`);
