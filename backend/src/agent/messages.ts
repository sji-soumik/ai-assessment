import { ToolMessage } from "@langchain/core/messages";
import type { AgentMessage } from "./state";

export function textOf(message: { content: unknown } | undefined): string {
  if (!message) return "";
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

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
