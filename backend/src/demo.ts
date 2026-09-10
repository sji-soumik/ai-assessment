// Phase 14 failure-scenario runner: bun run demo <scenario>
// Live Claude + Phoenix. token_heavy sends ~80k input tokens (~$0.40).
import { AgentInvokeError, invokeAgent } from "./agent/invoke";
import {
  CHAOS_SCENARIOS,
  isChaosScenario,
  type ChaosScenario,
} from "./chaos";
import { flushTelemetry, initTelemetry, shutdownTelemetry } from "./obs/otel";
import { formatTraceTree } from "./obs/traceTree";

initTelemetry();

const DEMO_PROMPTS: Record<ChaosScenario, string> = {
  slow_tool: "What is the current 30-year FHA mortgage rate?",
  tool_failure: "What is the current 30-year FHA mortgage rate?",
  bad_retrieval: "What is the FHA credit overlay?",
  token_heavy: "What is the current base rate?",
  llm_timeout: "What is the current base rate?",
};

const EXPECTED: Record<ChaosScenario, string> = {
  slow_tool: "Tool Call latency ~8s (p95 ↑ on Grafana Performance)",
  tool_failure: "Tool Status: ERROR, Error: Connection refused (request still completes)",
  bad_retrieval: "Retrieval Quality: Poor, scores 0.31 / 0.28 / 0.24",
  token_heavy: "LLM input tokens 80,000+ and cost spike (Grafana Cost). ~$0.40 at Opus 5 rates.",
  llm_timeout: "LLM Status: ERROR, Error: Request timeout (request fails)",
};

function printUsage(): void {
  console.log(`Usage: bun run demo <scenario>

Scenarios:
${CHAOS_SCENARIOS.map((s) => `  ${s.padEnd(16)} ${EXPECTED[s]}`).join("\n")}

token_heavy hits the live API with ~80k input tokens (~$0.40). Tests never do this.
`);
}

const arg = process.argv[2];
if (!arg || arg === "-h" || arg === "--help") {
  printUsage();
  process.exit(arg ? 0 : 1);
}

if (!isChaosScenario(arg)) {
  console.error(`unknown scenario "${arg}"`);
  printUsage();
  process.exit(1);
}

const scenario = arg;
const question = DEMO_PROMPTS[scenario];

console.log(`scenario: ${scenario}`);
console.log(`expected: ${EXPECTED[scenario]}`);
console.log(`User: ${question}\n`);

try {
  const { result, flow, requestId, traceId, durationMs } = await invokeAgent(question, {
    userId: "demo",
    scenario,
  });

  console.log(`Agent: ${result.finalAnswer}\n`);
  console.log(`requestId: ${requestId}`);
  if (traceId) console.log(`traceId: ${traceId}`);
  console.log(`steps: ${flow.steps.join(" → ")}`);
  console.log("--- trace ---");
  console.log(
    formatTraceTree({
      requestId,
      traceId: traceId ?? "(none)",
      llmCalls: result.llmCalls,
      retrievals: result.retrievals,
      toolCalls: result.toolCalls,
      finalAnswer: result.finalAnswer,
    }),
  );
  console.log(`total: ${durationMs}ms`);
} catch (err) {
  if (err instanceof AgentInvokeError) {
    console.error(`requestId: ${err.requestId}`);
    if (err.traceId) console.error(`traceId: ${err.traceId}`);
  }
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  await flushTelemetry();
  await shutdownTelemetry();
  process.exit(scenario === "llm_timeout" ? 0 : 1);
}

await flushTelemetry();
await shutdownTelemetry();
