/** Canonical span names — must match AGENT.md / SPEC.md span tree. */
export const SpanName = {
  agent: "agent",
  llmCall: "llm.call",
  llmReasoning: "llm.reasoning",
  retrieval: "retrieval",
  toolCall: "tool.call",
  finalResponse: "final.response",
} as const;

export type SpanNameValue = (typeof SpanName)[keyof typeof SpanName];

/** Map LLM node purpose to the correct span name. */
export function llmSpanName(purpose: "agent" | "reasoning"): SpanNameValue {
  return purpose === "reasoning" ? SpanName.llmReasoning : SpanName.llmCall;
}
