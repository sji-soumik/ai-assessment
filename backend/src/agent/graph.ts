import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentStateAnnotation } from "./state";
import { makeLlmNode, respondNode, retrievalNode, routeAfterLlm, toolNode } from "./nodes";
import { makeModel } from "../llm";

/**
 * LangGraph topology (Phase 1):
 *
 *   START
 *     ↓
 *   agent ──decision──┬─ retrieval ──┐
 *                     ├─ tool ───────┼─→ reasoning ──decision──┬─ retrieval
 *                     └─ respond ──→ END                      ├─ tool
 *                                                               └─ respond → END
 *
 * Retrieval and tool nodes are stubs until Phase 3/4. Basic conversation takes
 * agent → respond → END because no tools are bound to the model yet.
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
    .addEdge("retrieval", "reasoning")
    .addEdge("tool", "reasoning")
    .addConditionalEdges("reasoning", route, {
      retrieval: "retrieval",
      tool: "tool",
      respond: "respond",
    })
    .addEdge("respond", END)
    .compile();
}
