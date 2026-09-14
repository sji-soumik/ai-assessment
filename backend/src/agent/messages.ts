import { ToolMessage } from "@langchain/core/messages";
import type { AgentMessage } from "./state";

/** Bridge LangChain message instances into graph-state typing. */
export function toAgentMessage(message: unknown): AgentMessage {
  return message as AgentMessage;
}

export function toAgentMessages(messages: readonly unknown[]): AgentMessage[] {
  return messages as AgentMessage[];
}

export function toToolMessage(content: string, toolCallId: string, name: string): AgentMessage {
  return new ToolMessage(content, toolCallId, name) as unknown as AgentMessage;
}
