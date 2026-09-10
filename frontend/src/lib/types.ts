/** Mirrors backend graph-state capture (see backend/src/agent/state.ts). */

export interface LLMCallRecord {
  purpose: "agent" | "reasoning";
  model: string;
  provider: string;
  input: string;
  output: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: "success" | "error";
  error?: string;
}

export interface RetrievalRecord {
  query: string;
  topK: number;
  chunkIds: number[];
  documentIds: number[];
  sourcePaths: string[];
  similarityScores: number[];
  texts: string[];
  latencyMs: number;
  status: "success" | "error";
  error?: string;
}

export interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  startedAt: number;
  endedAt: number;
  latencyMs: number;
  result: string;
  status: "success" | "error";
  error?: string;
}

export interface ChatResponse {
  reply: string;
  /** Ordered graph steps, e.g. ["llm.agent","tool.getMortgageRate","llm.reasoning","respond"] */
  flow: string[];
  requestId?: string;
  traceId?: string;
  llmCalls: LLMCallRecord[];
  retrievals: RetrievalRecord[];
  toolCalls: ToolCallRecord[];
  durationMs: number;
}

export interface ChatErrorResponse {
  error: string;
  requestId?: string;
  traceId?: string;
}

export interface HealthResponse {
  ok: boolean;
}

export type PipelineStepKind = "agent" | "retrieval" | "tool" | "reasoning" | "response";

export interface PipelineStep {
  id: string;
  kind: PipelineStepKind;
  label: string;
  status: "pending" | "active" | "done" | "error" | "skipped";
  latencyMs?: number;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  capture?: ChatResponse;
  timestamp: number;
}
