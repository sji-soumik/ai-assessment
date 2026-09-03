import { AIMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MODEL_ID, PROVIDER } from "../llm";
import type { AgentState, LLMCallRecord } from "./state";

const SYSTEM_PROMPT = `You are a mortgage-lending assistant for an internal team.
You answer questions about base rates, mortgage rates, products, and lending policy.

Knowledge-base retrieval and live rate tools are being added in later phases. If you
lack authoritative current data for a question, say so explicitly, then give your best
general answer clearly labelled as general knowledge (not a live quote).
Keep answers concise.`;

const truncate = (s: string, n = 600) => (s.length > n ? s.slice(0, n) + "…" : s);

function textOf(message: BaseMessage | undefined): string {
  if (!message) return "";
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

/**
 * Agent node factory. The model is injected so tests can pass a fake model;
 * production wiring passes makeModel() (see graph.ts).
 */
export function makeAgentNode(model: BaseChatModel) {
  return async function agentNode(state: AgentState) {
    // A second pass over tool results is the "LLM reasoning" step of the flow.
    const isReasoningPass = state.messages.some((m) => m.getType() === "tool");
    const input: BaseMessage[] = [new SystemMessage(SYSTEM_PROMPT), ...state.messages];
    const started = performance.now();
    try {
      const response = (await model.invoke(input)) as AIMessage;
      const record: LLMCallRecord = {
        purpose: isReasoningPass ? "reasoning" : "agent",
        model: MODEL_ID,
        provider: PROVIDER,
        input: truncate(textOf(state.messages.at(-1))),
        output: truncate(textOf(response)),
        inputTokens: response.usage_metadata?.input_tokens ?? 0,
        outputTokens: response.usage_metadata?.output_tokens ?? 0,
        latencyMs: Math.round(performance.now() - started),
        status: "success",
      };
      console.log(
        `[llm] ${record.purpose} ok model=${record.model} tokens=${record.inputTokens}->${record.outputTokens} latency=${record.latencyMs}ms`,
      );
      return { messages: [response], llmCalls: [record] };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - started);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[llm] error after ${latencyMs}ms: ${message}`);
      // Phase 1–2: an LLM failure fails the request. Graceful degradation and
      // chaos-specific handling arrive with observability + failure testing.
      throw err;
    }
  };
}

/** Decision node logic: route to tools when the LLM asked for them, else finish. */
export function route(state: { messages: BaseMessage[] }): "tools" | "respond" {
  const last = state.messages.at(-1);
  if (last instanceof AIMessage && (last.tool_calls?.length ?? 0) > 0) return "tools";
  return "respond";
}

/** Placeholder — retrieval (Phase 3) and getMortgageRate (Phase 4) plug in here. */
export async function toolsNode(_state: AgentState): Promise<Partial<AgentState>> {
  throw new Error("tools node arrives in Phase 3 (retrieval) / Phase 4 (tools)");
}

/** Final response node: lift the last AI message into finalAnswer. */
export async function respondNode(state: AgentState) {
  return { finalAnswer: textOf(state.messages.at(-1)) };
}
