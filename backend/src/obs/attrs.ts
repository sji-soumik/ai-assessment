import type { Span } from "@opentelemetry/api";
import type { LLMCallRecord, RetrievalRecord, ToolCallRecord } from "../agent/state";
import { llmCostUsd } from "./cost";

const MAX_ATTR_LEN = 600;

function truncate(value: string, max = MAX_ATTR_LEN): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}

/** GenAI + project attrs for llm.call / llm.reasoning spans (Phase 7). */
export function setLlmSpanAttrs(span: Span, record: LLMCallRecord): void {
  span.setAttribute("gen_ai.system", record.provider);
  span.setAttribute("gen_ai.request.model", record.model);
  span.setAttribute("gen_ai.usage.input_tokens", record.inputTokens);
  span.setAttribute("gen_ai.usage.output_tokens", record.outputTokens);
  span.setAttribute(
    "gen_ai.usage.total_tokens",
    record.inputTokens + record.outputTokens,
  );
  span.setAttribute("llm.latency_ms", record.latencyMs);
  span.setAttribute("llm.cost_usd", llmCostUsd(record.inputTokens, record.outputTokens));
  span.setAttribute("llm.purpose", record.purpose);
  span.setAttribute("llm.status", record.status);
  if (record.input) span.setAttribute("llm.request", truncate(record.input));
  if (record.output) span.setAttribute("llm.response", truncate(record.output));
  if (record.error) span.setAttribute("llm.error", truncate(record.error));
}

/** Retrieval span attrs (Phase 8). */
export function setRetrievalSpanAttrs(span: Span, record: RetrievalRecord): void {
  span.setAttribute("retrieval.query", truncate(record.query, 200));
  span.setAttribute("retrieval.top_k", record.topK);
  span.setAttribute("retrieval.document_count", record.chunkIds.length);
  span.setAttribute("retrieval.chunk_ids", JSON.stringify(record.chunkIds));
  span.setAttribute("retrieval.document_ids", JSON.stringify(record.documentIds));
  span.setAttribute("retrieval.similarity_scores", JSON.stringify(record.similarityScores));
  span.setAttribute("retrieval.latency_ms", record.latencyMs);
  span.setAttribute("retrieval.status", record.status);
  if (record.error) span.setAttribute("retrieval.error", truncate(record.error));
}

/** Tool span attrs (Phase 9). */
export function setToolSpanAttrs(span: Span, record: ToolCallRecord): void {
  span.setAttribute("tool.name", record.name);
  span.setAttribute("tool.arguments", JSON.stringify(record.arguments));
  span.setAttribute("tool.latency_ms", record.latencyMs);
  span.setAttribute("tool.status", record.status);
  span.setAttribute("tool.result", truncate(record.result));
  if (record.error) span.setAttribute("tool.error", truncate(record.error));
}

/** Final response span attrs. */
export function setFinalResponseSpanAttrs(span: Span, answer: string): void {
  span.setAttribute("response.length", answer.length);
  span.setAttribute("response.text", truncate(answer));
}
