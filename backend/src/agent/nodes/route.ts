import { AIMessage } from "@langchain/core/messages";
import type { AgentState } from "../state";

export type AgentRoute = "retrieval" | "tool" | "respond";

/** Tool-call names that mean "search the knowledge base" (handled by retrieval). */
export const RETRIEVAL_TOOL_NAMES = new Set(["retrieve", "search_knowledge_base"]);

export function isRetrievalTool(name: string): boolean {
  return RETRIEVAL_TOOL_NAMES.has(name);
}

function toolNames(messages: AgentState["messages"]): string[] {
  const last = messages.at(-1);
  if (!(last instanceof AIMessage) || !last.tool_calls?.length) return [];
  return last.tool_calls.map((tc) => tc.name);
}

/**
 * Route after agent or reasoning: pick retrieval, live tool, or final response.
 * When a turn mixes retrieval and other tool calls, go to retrieval first — the
 * graph then chains retrieval → tool so both are answered in one pass.
 */
export function routeAfterLlm(state: Pick<AgentState, "messages">): AgentRoute {
  const names = toolNames(state.messages);
  if (names.length === 0) return "respond";
  if (names.some(isRetrievalTool)) return "retrieval";
  return "tool";
}
