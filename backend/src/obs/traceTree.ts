import { LLM_TIMEOUT_MESSAGE, retrievalQuality, SLOW_TOOL_WARN_MS } from "../chaos";
import { llmCostUsd } from "./cost";
import type { LLMCallRecord, RetrievalRecord, ToolCallRecord } from "../agent/state";

export interface TraceTreeInput {
  requestId?: string;
  traceId: string;
  llmCalls: LLMCallRecord[];
  retrievals: RetrievalRecord[];
  toolCalls: ToolCallRecord[];
  finalAnswer: string;
}

function formatLatency(ms: number): string {
  if (ms >= SLOW_TOOL_WARN_MS) return `${(ms / 1000).toFixed(1)} sec ⚠️`;
  return `${ms}ms`;
}

function llmAttrs(call: LLMCallRecord): string[] {
  const cost = llmCostUsd(call.inputTokens, call.outputTokens);
  const lines = [
    `Model: ${call.model}`,
    `Tokens: ${call.inputTokens} in / ${call.outputTokens} out`,
    `Latency: ${formatLatency(call.latencyMs)}`,
    `Cost: $${cost.toFixed(6)}`,
  ];
  if (call.status === "error") {
    lines.push("Status: ERROR");
    lines.push(`Error: ${call.error ?? LLM_TIMEOUT_MESSAGE}`);
  }
  return lines;
}

function retrievalAttrs(record: RetrievalRecord): string[] {
  const docs = record.sourcePaths.length > 0 ? record.sourcePaths.join(", ") : "(none)";
  const lines = [
    `Query: ${record.query}`,
    `Documents: ${docs}`,
    `Similarity: ${JSON.stringify(record.similarityScores)}`,
  ];
  if (record.status === "success" && retrievalQuality(record.similarityScores) === "poor") {
    lines.push("Quality: Poor");
  }
  if (record.status === "error") {
    lines.push("Status: ERROR");
    if (record.error) lines.push(`Error: ${record.error}`);
  }
  return lines;
}

function toolAttrs(record: ToolCallRecord): string[] {
  const lines = [
    `Name: ${record.name}`,
    `Arguments: ${JSON.stringify(record.arguments)}`,
    `Result: ${record.result}`,
    `Latency: ${formatLatency(record.latencyMs)}`,
  ];
  if (record.status === "error") {
    lines.push("Status: ERROR");
    if (record.error) lines.push(`Error: ${record.error}`);
  }
  return lines;
}

/**
 * ASCII tree matching the Phase 11 demo shape. Printed by the CLI so the
 * assessor can read the same structure Phoenix shows for the trace id.
 */
export function formatTraceTree(input: TraceTreeInput): string {
  type Node = { title: string; children: string[] };

  const agentCall = input.llmCalls.find((c) => c.purpose === "agent");
  const reasoningCall = input.llmCalls.find((c) => c.purpose === "reasoning");

  const nodes: Node[] = [{ title: "Agent", children: [] }];
  if (agentCall) nodes.push({ title: "LLM Call", children: llmAttrs(agentCall) });
  for (const retrieval of input.retrievals) {
    nodes.push({ title: "Retrieval", children: retrievalAttrs(retrieval) });
  }
  for (const tool of input.toolCalls) {
    nodes.push({ title: "Tool Call", children: toolAttrs(tool) });
  }
  if (reasoningCall) nodes.push({ title: "LLM Reasoning", children: llmAttrs(reasoningCall) });
  nodes.push({
    title: "Final Response",
    children: [input.finalAnswer || "(empty)"],
  });

  const header: string[] = [];
  if (input.requestId) header.push(`Request ID: ${input.requestId}`);
  header.push(`Trace ID: ${input.traceId}`, "");

  const lines: string[] = header;
  for (let i = 0; i < nodes.length; i++) {
    const last = i === nodes.length - 1;
    const node = nodes[i]!;
    lines.push(`${last ? "└──" : "├──"} ${node.title}`);
    const stem = last ? "    " : "│   ";
    for (let j = 0; j < node.children.length; j++) {
      const lastChild = j === node.children.length - 1;
      lines.push(`${stem}${lastChild ? "└──" : "├──"} ${node.children[j]}`);
    }
    if (!last) lines.push("│");
  }
  return lines.join("\n");
}
