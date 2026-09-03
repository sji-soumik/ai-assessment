import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AgentStateAnnotation } from "./state";
import { makeAgentNode, respondNode, route, toolsNode } from "./nodes";
import { makeModel } from "../llm";

/**
 * START → agent → (decision) ─┬─ tools → agent   (reasoning loop; live from Phase 3/4)
 *                             └─ respond → END
 */
export function buildGraph(model: BaseChatModel = makeModel()) {
  return new StateGraph(AgentStateAnnotation)
    .addNode("agent", makeAgentNode(model))
    .addNode("tools", toolsNode)
    .addNode("respond", respondNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", route, { tools: "tools", respond: "respond" })
    .addEdge("tools", "agent")
    .addEdge("respond", END)
    .compile();
}
