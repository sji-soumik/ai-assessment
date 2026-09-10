// One-shot CLI conversation: bun run chat "What is the current base rate?"
// Optional: bun run chat -- --user alice --scenario slow_tool "question"
import { AgentInvokeError, invokeAgent } from "./agent/invoke";
import { CHAOS_SCENARIOS, parseScenario, type ChaosScenario } from "./chaos";
import { sanitizeUserId } from "./obs/metrics";
import { flushTelemetry, initTelemetry, shutdownTelemetry } from "./obs/otel";
import { resolveRequestId } from "./obs/requestContext";
import { formatTraceTree } from "./obs/traceTree";

initTelemetry();

function parseChatArgs(argv: string[]): {
  userId: string;
  question: string;
  scenario?: ChaosScenario;
  requestId?: string;
} {
  let userId = "cli";
  let scenario: ChaosScenario | undefined;
  let requestId: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--user" && argv[i + 1]) {
      userId = sanitizeUserId(argv[++i]);
      continue;
    }
    if (arg.startsWith("--user=")) {
      userId = sanitizeUserId(arg.slice("--user=".length));
      continue;
    }
    if (arg === "--scenario" && argv[i + 1]) {
      scenario = parseScenario(argv[++i]);
      continue;
    }
    if (arg.startsWith("--scenario=")) {
      scenario = parseScenario(arg.slice("--scenario=".length));
      continue;
    }
    if (arg === "--request-id" && argv[i + 1]) {
      requestId = resolveRequestId(argv[++i]);
      continue;
    }
    if (arg.startsWith("--request-id=")) {
      requestId = resolveRequestId(arg.slice("--request-id=".length));
      continue;
    }
    rest.push(arg);
  }
  return {
    userId,
    scenario,
    requestId,
    question: rest.join(" ").trim() || "What is the current base rate?",
  };
}

const { userId, question, scenario, requestId } = parseChatArgs(process.argv.slice(2));

if (scenario) {
  console.log(`scenario: ${scenario} (one of ${CHAOS_SCENARIOS.join(", ")})\n`);
}

console.log(`User: ${question}\n`);

try {
  const { result, flow, requestId: reqId, traceId, durationMs } = await invokeAgent(question, {
    userId,
    scenario,
    requestId,
  });

  console.log(`Agent: ${result.finalAnswer}\n`);
  console.log(`requestId: ${reqId}`);
  if (traceId) console.log(`traceId: ${traceId}`);

  console.log("--- end-to-end trace (Phase 11) ---");
  console.log(
    formatTraceTree({
      requestId: reqId,
      traceId: traceId ?? "(none)",
      llmCalls: result.llmCalls,
      retrievals: result.retrievals,
      toolCalls: result.toolCalls,
      finalAnswer: result.finalAnswer,
    }),
  );

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

  console.log(`total: ${durationMs}ms`);
} catch (err) {
  if (err instanceof AgentInvokeError) {
    console.error(`requestId: ${err.requestId}`);
    if (err.traceId) console.error(`traceId: ${err.traceId}`);
  }
  console.error(err instanceof Error ? err.message : String(err));
  await flushTelemetry();
  await shutdownTelemetry();
  process.exit(1);
}

await flushTelemetry();
await shutdownTelemetry();
