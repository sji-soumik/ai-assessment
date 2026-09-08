import { AIMessage } from "@langchain/core/messages";
import type { AgentState } from "../state";

export type AgentRoute = "retrieval" | "tool" | "respond";

const RETRIEVAL_TOOLS = new Set(["retrieve", "search_knowledge_base"]);

function toolNames(messages: AgentState["messages"]): string[] {
  const last = messages.at(-1);
  if (!(last instanceof AIMessage) || !last.tool_calls?.length) return [];
  return last.tool_calls.map((tc) => tc.name);
}

/** Route after agent or reasoning: pick retrieval, live tool, or final response. */
export function routeAfterLlm(state: Pick<AgentState, "messages">): AgentRoute {
  const names = toolNames(state.messages);
  if (names.length === 0) return "respond";
  if (names.some((n) => RETRIEVAL_TOOLS.has(n))) return "retrieval";
  return "tool";
}
