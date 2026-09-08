import type { BaseMessage } from "@langchain/core/messages";
import type { AgentMessage } from "./state";

/** Bridge LangChain message instances into graph-state typing. */
export function toAgentMessage(message: unknown): AgentMessage {
  return message as AgentMessage;
}

export function toAgentMessages(messages: readonly unknown[]): AgentMessage[] {
  return messages as AgentMessage[];
}

/** Satisfy chat-model APIs typed as BaseMessage[] (role generic is invariant in TS). */
export function asModelMessages(messages: readonly unknown[]): BaseMessage[] {
  return messages as unknown as BaseMessage[];
}
