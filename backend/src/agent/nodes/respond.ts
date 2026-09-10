import type { AgentState } from "../state";
import { setFinalResponseSpanAttrs } from "../../obs/attrs";
import { SpanName } from "../../obs/names";
import { withSpan } from "../../obs/spans";
import { textOf } from "./llm";

/** Final response node: lift the last AI message into finalAnswer. */
export async function respondNode(state: AgentState): Promise<Partial<AgentState>> {
  return withSpan(SpanName.finalResponse, async (span) => {
    const finalAnswer = textOf(state.messages.at(-1));
    setFinalResponseSpanAttrs(span, finalAnswer);
    return { finalAnswer };
  });
}
