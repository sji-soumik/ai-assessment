import { AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MODEL_ID, PROVIDER } from "../../llm";
import { toAgentMessage } from "../messages";
import type { AgentMessage, AgentState, LLMCallRecord } from "../state";

const SYSTEM_PROMPT = `You are a mortgage-lending assistant for an internal team.
You answer questions about base rates, mortgage rates, products, and lending policy.

Knowledge-base retrieval and live rate tools are being added in later phases. If you
lack authoritative current data for a question, say so explicitly, then give your best
general answer clearly labelled as general knowledge (not a live quote).
Keep answers concise.`;

export const truncate = (s: string, n = 600) => (s.length > n ? s.slice(0, n) + "…" : s);

export function textOf(message: AgentMessage | undefined): string {
  if (!message) return "";
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

/** Shared LLM invocation with internal capture (Phase 2 seam — no OTel yet). */
export function makeLlmNode(model: BaseChatModel, purpose: LLMCallRecord["purpose"]) {
  return async function llmNode(state: AgentState): Promise<Partial<AgentState>> {
    const input = [new SystemMessage(SYSTEM_PROMPT), ...state.messages];
    const started = performance.now();

    try {
      const response = (await model.invoke(input)) as AIMessage;
      const record: LLMCallRecord = {
        purpose,
        model: MODEL_ID,
        provider: PROVIDER,
        input: truncate(textOf(state.messages.at(-1))),
        output: truncate(textOf(toAgentMessage(response))),
        inputTokens: response.usage_metadata?.input_tokens ?? 0,
        outputTokens: response.usage_metadata?.output_tokens ?? 0,
        latencyMs: Math.round(performance.now() - started),
        status: "success",
      };
      console.log(
        `[llm] ${record.purpose} ok model=${record.model} tokens=${record.inputTokens}->${record.outputTokens} latency=${record.latencyMs}ms`,
      );
      return { messages: [toAgentMessage(response)], llmCalls: [record] };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - started);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[llm] ${purpose} error after ${latencyMs}ms: ${message}`);
      throw err;
    }
  };
}
