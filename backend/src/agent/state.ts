import type { BaseMessage, MessageStructure, MessageToolSet, MessageType } from "@langchain/core/messages";
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/** Graph message type — matches MessagesAnnotation's MessageToolSet envelope. */
export type AgentMessage = BaseMessage<MessageStructure<MessageToolSet>, MessageType>;

/**
 * Internal capture of a single LLM call (Phase 2 requirement):
 * model, input, output, input tokens, output tokens, latency, error.
 * Plain data in graph state + console — telemetry export arrives in Phase 6+.
 */
export interface LLMCallRecord {
  purpose: "agent" | "reasoning";
  model: string;
  provider: string;
  input: string; // last user-visible input for this call (truncated)
  output: string; // model output text (truncated)
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: "success" | "error";
  error?: string;
}

export const AgentStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  llmCalls: Annotation<LLMCallRecord[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  finalAnswer: Annotation<string>({
    reducer: (_a, b) => b,
    default: () => "",
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;
