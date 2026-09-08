import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { toAgentMessages } from "../messages";
import type { AgentState } from "../state";

/** Phase 4 replaces this with getMortgageRate / getRateSheet. */
export async function toolNode(state: AgentState): Promise<Partial<AgentState>> {
  const last = state.messages.at(-1);
  if (!(last instanceof AIMessage) || !last.tool_calls?.length) {
    return {};
  }

  const messages = last.tool_calls.map(
    (tc) =>
      new ToolMessage(
        `Tool "${tc.name}" is not wired yet (Phase 4). No live rate data was returned.`,
        tc.id ?? "tool_stub",
        tc.name,
      ),
  );

  return { messages: toAgentMessages(messages) };
}
