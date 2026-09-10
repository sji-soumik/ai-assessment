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

export interface InvokeAgentOptions {
  userId?: string;
  graph?: ReturnType<typeof buildGraph>;
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

function requestCostUsd(state: Pick<AgentState, "llmCalls">): number {
  return state.llmCalls.reduce(
    (sum, call) => sum + llmCostUsd(call.inputTokens, call.outputTokens),
    0,
  );
}

function resolveGraph(
  options: InvokeAgentOptions,
  scenario: ChaosScenario | undefined,
): ReturnType<typeof buildGraph> {
  if (options.graph) return options.graph;
  if (scenario === "llm_timeout") {
    const timeoutMs = chaosLlmTimeoutMs() ?? LLM_TIMEOUT_MS;
    return buildGraph(makeModel({ timeoutMs, maxRetries: 0 }));
  }
  return buildGraph();
}

/**
 * One user request: root `agent` span, graph invoke, request-level metrics,
 * then (outside the span) the groundedness judge so Phoenix's demo tree stays clean.
 */
export async function invokeAgent(
  message: string,
  options: InvokeAgentOptions = {},
): Promise<InvokeAgentResult> {
  const user = sanitizeUserId(options.userId);
  const requestId = resolveRequestId(options.requestId);
  const scenario = options.scenario;

  return runWithRequestContextAsync(
    { requestId, scenario, chaosOverrides: options.chaosOverrides },
    async () => {
      const graph = resolveGraph(options, scenario);
      const started = performance.now();
      let traceId: string | undefined;

      try {
        const result = await withSpan(SpanName.agent, async (span) => {
          span.setAttribute("user.message.length", message.length);
          span.setAttribute("user.id", user);
          span.setAttribute("request.id", requestId);
          if (scenario) span.setAttribute("chaos.scenario", scenario);
          traceId = span.spanContext().traceId;
          const invoked = await graph.invoke({
            messages: [new HumanMessage(message)],
          });
          const flow = summarizeFlow(invoked);
          span.setAttribute("flow.complete", flow.isCompleteFlow);
          span.setAttribute("flow.steps", flow.steps.join(" → "));
          return invoked;
        });

        const durationMs = Math.round(performance.now() - started);
        recordAgentRequest({
          user,
          status: "success",
          durationSeconds: durationMs / 1000,
          costUsd: requestCostUsd(result),
        });

        if (options.evaluate !== false) {
          const verdict = await evaluateGroundedness({
            answer: result.finalAnswer,
            retrievals: result.retrievals,
            toolCalls: result.toolCalls,
          });
          if (verdict) recordGroundedness(verdict);
        }

        return { result, flow: summarizeFlow(result), requestId, traceId, durationMs, user };
      } catch (err) {
        const durationMs = Math.round(performance.now() - started);
        recordAgentRequest({
          user,
          status: "error",
          durationSeconds: durationMs / 1000,
          costUsd: 0,
        });
        if (err instanceof AgentInvokeError) throw err;
        const messageText = isLlmTimeout(err)
          ? LLM_TIMEOUT_MESSAGE
          : err instanceof Error
            ? err.message
            : String(err);
        throw new AgentInvokeError(messageText, { requestId, traceId, cause: err });
      }
    },
  );
}
