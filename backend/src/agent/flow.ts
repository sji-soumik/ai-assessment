import type { AgentState } from "./state";

/** Ordered steps taken for one request — used for Phase 5 demos and API responses. */
export type FlowStep =
  | "llm.agent"
  | "retrieval"
  | `tool.${string}`
  | "llm.reasoning"
  | "respond";

export interface FlowSummary {
  /** Steps in execution order, e.g. llm.agent → retrieval → tool.getMortgageRate → llm.reasoning → respond */
  steps: FlowStep[];
  llmCallCount: number;
  retrievalCount: number;
  toolCallCount: number;
  /** True when one request ran agent LLM, retrieval, tool, reasoning LLM, and produced a final answer. */
  isCompleteFlow: boolean;
}

/** Derive the operation sequence from captured graph state (no telemetry required). */
export function summarizeFlow(
  result: Pick<AgentState, "llmCalls" | "retrievals" | "toolCalls" | "finalAnswer">,
): FlowSummary {
  const steps: FlowStep[] = [];

  if (result.llmCalls.some((c) => c.purpose === "agent")) steps.push("llm.agent");
  if (result.retrievals.length > 0) steps.push("retrieval");
  for (const call of result.toolCalls) steps.push(`tool.${call.name}`);
  if (result.llmCalls.some((c) => c.purpose === "reasoning")) steps.push("llm.reasoning");
  if (result.finalAnswer.length > 0) steps.push("respond");

  const isCompleteFlow =
    result.llmCalls.some((c) => c.purpose === "agent") &&
    result.retrievals.length > 0 &&
    result.toolCalls.length > 0 &&
    result.llmCalls.some((c) => c.purpose === "reasoning") &&
    result.finalAnswer.length > 0;

  return {
    steps,
    llmCallCount: result.llmCalls.length,
    retrievalCount: result.retrievals.length,
    toolCallCount: result.toolCalls.length,
    isCompleteFlow,
  };
}
