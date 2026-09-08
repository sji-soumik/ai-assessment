import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentStateAnnotation } from "./state";
import { makeLlmNode, respondNode, retrievalNode, routeAfterLlm, toolNode } from "./nodes";
import { makeModel } from "../llm";

/**
 * LangGraph topology (Phases 1–5):
 *
 *   START
 *     ↓
 *   agent ──decision──┬─ retrieval ─→ tool ─→ reasoning ──decision──┬─ retrieval
 *                     ├─ tool ───────────────→ reasoning            ├─ tool
 *                     └─ respond ──→ END                            └─ respond → END
 *
 * retrieval → tool (not straight to reasoning) so a turn that mixes a `retrieve`
 * and a `getMortgageRate` call has both answered before reasoning. Each node only
 * handles its own pending calls; tool no-ops when there is nothing left to run.
 */
export function buildGraph(model: BaseChatModel = makeModel()) {
  const route = routeAfterLlm;

  return new StateGraph(AgentStateAnnotation)
    .addNode("agent", makeLlmNode(model, "agent"))
    .addNode("retrieval", retrievalNode)
    .addNode("tool", toolNode)
    .addNode("reasoning", makeLlmNode(model, "reasoning"))
    .addNode("respond", respondNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", route, {
      retrieval: "retrieval",
      tool: "tool",
      respond: "respond",
    })
    .addEdge("retrieval", "tool")
    .addEdge("tool", "reasoning")
    .addConditionalEdges("reasoning", route, {
      retrieval: "retrieval",
      tool: "tool",
      respond: "respond",
    })
    .addEdge("respond", END)
    .compile();
}
