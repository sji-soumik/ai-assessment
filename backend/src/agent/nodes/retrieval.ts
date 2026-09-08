import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { toAgentMessages } from "../messages";
import type { AgentState } from "../state";

/** Phase 3 replaces this with pgvector similarity search. */
export async function retrievalNode(state: AgentState): Promise<Partial<AgentState>> {
  const last = state.messages.at(-1);
  if (!(last instanceof AIMessage) || !last.tool_calls?.length) {
    return {};
  }

  const messages = last.tool_calls.map(
    (tc) =>
      new ToolMessage(
        "Retrieval is not wired yet (Phase 3). No knowledge-base documents were returned.",
        tc.id ?? "retrieval_stub",
        tc.name,
      ),
  );

  return { messages: toAgentMessages(messages) };
}
