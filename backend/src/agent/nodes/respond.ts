import type { AgentState } from "../state";
import { textOf } from "./llm";

/** Final response node: lift the last AI message into finalAnswer. */
export async function respondNode(state: AgentState): Promise<Partial<AgentState>> {
  return { finalAnswer: textOf(state.messages.at(-1)) };
}
