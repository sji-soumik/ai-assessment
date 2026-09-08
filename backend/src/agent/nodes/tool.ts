import { ToolMessage } from "@langchain/core/messages";
import { toAgentMessages } from "../messages";
import type { AgentMessage, AgentState, ToolCallRecord } from "../state";
import { getMortgageRate, MORTGAGE_RATE_TOOL } from "../../tools/getMortgageRate";
import { truncate } from "./llm";
import { pendingToolCalls } from "./pending";
import { isRetrievalTool } from "./route";

/**
 * Tool node (Phase 4): executes every pending non-retrieval tool call. Known
 * tools run; an unknown tool name still gets an error ToolMessage so the turn is
 * always answerable. Captures name, arguments, start/end, latency, result,
 * status, and error into state.toolCalls. Tool failures are data (recoverable),
 * not request failures.
 */
export async function toolNode(state: AgentState): Promise<Partial<AgentState>> {
  const pending = pendingToolCalls(state.messages, (name) => !isRetrievalTool(name));
  if (pending.length === 0) return {};

  const messages: AgentMessage[] = [];
  const records: ToolCallRecord[] = [];

  for (const call of pending) {
    const startedAt = Date.now();
    const started = performance.now();

    try {
      const result = runTool(call.name, call.args);
      const latencyMs = Math.round(performance.now() - started);
      records.push({
        name: call.name,
        arguments: call.args,
        startedAt,
        endedAt: Date.now(),
        latencyMs,
        result: truncate(result, 300),
        status: "success",
      });
      console.log(`[tool] ${call.name} ok latency=${latencyMs}ms result=${truncate(result, 80)}`);
      messages.push(toToolMessage(result, call.id, call.name));
    } catch (err) {
      const latencyMs = Math.round(performance.now() - started);
      const error = err instanceof Error ? err.message : String(err);
      records.push({
        name: call.name,
        arguments: call.args,
        startedAt,
        endedAt: Date.now(),
        latencyMs,
        result: error,
        status: "error",
        error,
      });
      console.error(`[tool] ${call.name} error after ${latencyMs}ms: ${error}`);
      messages.push(toToolMessage(`Tool error: ${error}`, call.id, call.name));
    }
  }

  return { messages: toAgentMessages(messages), toolCalls: records };
}

/** Dispatch a tool by name. Throws for unknown tools (caller records the error). */
function runTool(name: string, args: Record<string, unknown>): string {
  if (name === MORTGAGE_RATE_TOOL.name) {
    return JSON.stringify(getMortgageRate(args));
  }
  throw new Error(`Unknown tool "${name}".`);
}

function toToolMessage(content: string, toolCallId: string, name: string): AgentMessage {
  return new ToolMessage(content, toolCallId, name) as unknown as AgentMessage;
}
