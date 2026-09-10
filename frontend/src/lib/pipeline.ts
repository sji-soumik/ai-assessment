import type { ChatResponse, PipelineStep } from "./types";

/** Build an ordered timeline from backend capture arrays. */
export function buildPipelineSteps(capture: ChatResponse): PipelineStep[] {
  const steps: PipelineStep[] = [];
  let idx = 0;

  const agentLlm = capture.llmCalls.find((c) => c.purpose === "agent");
  if (agentLlm) {
    steps.push({
      id: `step-${idx++}`,
      kind: "agent",
      label: "Agent LLM",
      status: agentLlm.status === "error" ? "error" : "done",
      latencyMs: agentLlm.latencyMs,
      detail:
        agentLlm.status === "error"
          ? agentLlm.error
          : `${agentLlm.inputTokens}→${agentLlm.outputTokens} tokens`,
    });
  }

  if (capture.retrievals.length > 0) {
    for (const r of capture.retrievals) {
      steps.push({
        id: `step-${idx++}`,
        kind: "retrieval",
        label: "RAG Retrieval",
        status: r.status === "error" ? "error" : "done",
        latencyMs: r.latencyMs,
        detail:
          r.status === "error"
            ? r.error
            : `${r.chunkIds.length} chunks · top-${r.topK}`,
      });
    }
  }

  if (capture.toolCalls.length > 0) {
    for (const t of capture.toolCalls) {
      steps.push({
        id: `step-${idx++}`,
        kind: "tool",
        label: t.name,
        status: t.status === "error" ? "error" : "done",
        latencyMs: t.latencyMs,
        detail: t.status === "error" ? t.error : truncate(t.result, 80),
      });
    }
  }

  const reasoningLlm = capture.llmCalls.find((c) => c.purpose === "reasoning");
  if (reasoningLlm) {
    steps.push({
      id: `step-${idx++}`,
      kind: "reasoning",
      label: "Reasoning LLM",
      status: reasoningLlm.status === "error" ? "error" : "done",
      latencyMs: reasoningLlm.latencyMs,
      detail:
        reasoningLlm.status === "error"
          ? reasoningLlm.error
          : `${reasoningLlm.inputTokens}→${reasoningLlm.outputTokens} tokens`,
    });
  }

  steps.push({
    id: `step-${idx++}`,
    kind: "response",
    label: "Final Response",
    status: "done",
    latencyMs: capture.durationMs,
    detail: `${capture.durationMs}ms total`,
  });

  return steps;
}

/** Loading animation sequence — cycles through possible graph nodes. */
export const LOADING_PIPELINE: PipelineStep[] = [
  { id: "load-agent", kind: "agent", label: "Agent LLM", status: "active", detail: "Routing…" },
  { id: "load-retrieval", kind: "retrieval", label: "RAG Retrieval", status: "pending", detail: "pgvector" },
  { id: "load-tool", kind: "tool", label: "getMortgageRate", status: "pending", detail: "Live rates" },
  { id: "load-reasoning", kind: "reasoning", label: "Reasoning LLM", status: "pending", detail: "Synthesizing…" },
  { id: "load-response", kind: "response", label: "Final Response", status: "pending", detail: "…" },
];

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
