import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { AgentState } from "../state";

export interface PendingToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Tool calls from the most recent AI turn that still need a result. A call is
 * "pending" when its name passes `matches` and no ToolMessage has answered its
 * id yet. This lets retrieval and tool nodes each handle their own calls from a
 * single AI message without double-answering — and guarantees every tool_use
 * eventually gets a tool_result (Anthropic rejects a turn otherwise).
 */
export function pendingToolCalls(
  messages: AgentState["messages"],
  matches: (name: string) => boolean,
): PendingToolCall[] {
  let aiTurn: AIMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message instanceof AIMessage && message.tool_calls?.length) {
      aiTurn = message;
      break;
    }
  }
  if (!aiTurn?.tool_calls) return [];

  const answered = new Set<string>();
  for (const message of messages) {
    if (message instanceof ToolMessage && message.tool_call_id) {
      answered.add(message.tool_call_id);
    }
  }

  return aiTurn.tool_calls
    .filter((tc) => tc.id !== undefined && !answered.has(tc.id) && matches(tc.name))
    .map((tc) => ({
      id: tc.id!,
      name: tc.name,
      args: (tc.args ?? {}) as Record<string, unknown>,
    }));
}
