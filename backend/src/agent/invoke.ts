import { HumanMessage } from "@langchain/core/messages";
import {
  chaosLlmTimeoutMs,
  LLM_TIMEOUT_MESSAGE,
  LLM_TIMEOUT_MS,
  type ChaosOverrides,
  type ChaosScenario,
} from "../chaos";
import { makeModel } from "../llm";
import { llmCostUsd } from "../obs/cost";
import { evaluateGroundedness } from "../obs/eval";
import { isLlmTimeout, recordAgentRequest, recordGroundedness, sanitizeUserId } from "../obs/metrics";
import { SpanName } from "../obs/names";
import {
  resolveRequestId,
  runWithRequestContextAsync,
} from "../obs/requestContext";
import { withSpan } from "../obs/spans";
import { summarizeFlow, type FlowSummary } from "./flow";
import { buildGraph } from "./graph";
import type { AgentState } from "./state";

type AgentGraph = ReturnType<typeof buildGraph>;

export interface InvokeAgentOptions {
  userId?: string;
  graph?: AgentGraph;
  /** Run the groundedness judge after retrievals. Default true; tests can set false. */
  evaluate?: boolean;
  scenario?: ChaosScenario;
  requestId?: string;
  chaosOverrides?: ChaosOverrides;
}

export interface InvokeAgentResult {
  result: AgentState;
  flow: FlowSummary;
  requestId: string;
  traceId: string | undefined;
  durationMs: number;
  user: string;
}

/** Thrown so HTTP/CLI can still return requestId + traceId on a failed request. */
export class AgentInvokeError extends Error {
  readonly requestId: string;
  readonly traceId: string | undefined;

  constructor(
    message: string,
    options: { requestId: string; traceId?: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "AgentInvokeError";
    this.requestId = options.requestId;
    this.traceId = options.traceId;
  }
}

interface RequestMeta {
  user: string;
  requestId: string;
  scenario?: ChaosScenario;
}

function elapsedMs(since: number): number {
  return Math.round(performance.now() - since);
}

function requestCostUsd(state: Pick<AgentState, "llmCalls">): number {
  return state.llmCalls.reduce(
    (sum, call) => sum + llmCostUsd(call.inputTokens, call.outputTokens),
    0,
  );
}

function resolveGraph(options: InvokeAgentOptions, scenario?: ChaosScenario): AgentGraph {
  if (options.graph) return options.graph;
  if (scenario === "llm_timeout") {
    const timeoutMs = chaosLlmTimeoutMs() ?? LLM_TIMEOUT_MS;
    return buildGraph(makeModel({ timeoutMs, maxRetries: 0 }));
  }
  return buildGraph();
}

function recordOutcome(
  user: string,
  outcome: { status: "success" | "error"; durationMs: number; costUsd: number },
): void {
  recordAgentRequest({
    user,
    status: outcome.status,
    durationSeconds: outcome.durationMs / 1000,
    costUsd: outcome.costUsd,
  });
}

function invokeErrorMessage(err: unknown): string {
  if (isLlmTimeout(err)) return LLM_TIMEOUT_MESSAGE;
  if (err instanceof Error) return err.message;
  return String(err);
}

function scheduleGroundednessCheck(result: AgentState, evaluate?: boolean): void {
  if (evaluate === false) return;

  void evaluateGroundedness({
    answer: result.finalAnswer,
    retrievals: result.retrievals,
    toolCalls: result.toolCalls,
  }).then((verdict) => {
    if (verdict) recordGroundedness(verdict);
  });
}

/**
 * Runs the graph under the root `agent` span.
 * `traceRef` is filled before invoke so failures still carry a trace id.
 */
async function executeGraph(
  graph: AgentGraph,
  message: string,
  meta: RequestMeta,
  traceRef: { id?: string },
): Promise<{ result: AgentState; flow: FlowSummary }> {
  console.log("executeGraph", graph, message, meta, traceRef);
  return withSpan(SpanName.agent, async (span) => {
    span.setAttribute("user.message.length", message.length);
    span.setAttribute("user.id", meta.user);
    span.setAttribute("request.id", meta.requestId);
    if (meta.scenario) span.setAttribute("chaos.scenario", meta.scenario);

    traceRef.id = span.spanContext().traceId;

    const result = await graph.invoke({
      messages: [new HumanMessage(message)],
    });

    const flow = summarizeFlow(result);

    span.setAttribute("flow.complete", flow.isCompleteFlow);
    span.setAttribute("flow.steps", flow.steps.join(" → "));

    return { result, flow };
  });
}

/**
 * One user request: root `agent` span, graph invoke, request-level metrics,
 * then (outside the span, fire-and-forget) the groundedness judge so Phoenix's
 * demo tree stays clean and the response isn't held up waiting on the judge.
 */
export async function invokeAgent(
  message: string,
  options: InvokeAgentOptions = {},
): Promise<InvokeAgentResult> {
  const meta: RequestMeta = {
    user: sanitizeUserId(options.userId),
    requestId: resolveRequestId(options.requestId),
    scenario: options.scenario,
  };

  return runWithRequestContextAsync(
    {
      requestId: meta.requestId,
      scenario: meta.scenario,
      chaosOverrides: options.chaosOverrides,
    },
    async () => {
      const graph = resolveGraph(options, meta.scenario);
      const started = performance.now();
      const traceRef: { id?: string } = {};

      try {
        const { result, flow } = await executeGraph(graph, message, meta, traceRef);
        const durationMs = elapsedMs(started);

        recordOutcome(meta.user, {
          status: "success",
          durationMs,
          costUsd: requestCostUsd(result),
        });
        scheduleGroundednessCheck(result, options.evaluate);

        return {
          result,
          flow,
          requestId: meta.requestId,
          traceId: traceRef.id,
          durationMs,
          user: meta.user,
        };
      } catch (err) {
        recordOutcome(meta.user, {
          status: "error",
          durationMs: elapsedMs(started),
          costUsd: 0,
        });

        if (err instanceof AgentInvokeError) throw err;

        throw new AgentInvokeError(invokeErrorMessage(err), {
          requestId: meta.requestId,
          traceId: traceRef.id,
          cause: err,
        });
      }
    },
  );
}
