import { AIMessage, SystemMessage } from "@langchain/core/messages";
import type {
  BaseChatModel,
  BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { MODEL_ID, PROVIDER } from "../../llm";
import { setLlmSpanAttrs } from "../../obs/attrs";
import { llmSpanName } from "../../obs/names";
import { withSpan } from "../../obs/spans";
import { toAgentMessage } from "../messages";
import { BINDABLE_TOOLS } from "../tools";
import type { AgentMessage, AgentState, LLMCallRecord } from "../state";

const AGENT_PROMPT = `You are a mortgage-lending assistant for an internal team.
You answer questions about base rates, mortgage rates, products, and lending policy.

You have two tools:
- getMortgageRate: the source of truth for live numbers. Use it for ANY question about
  the current base rate or a product's rate. Omit arguments for the current base rate;
  pass product (base, conventional, fha, va) and termYears (15 or 30) for a specific quote.
- retrieve: search the knowledge base for lending policy, product eligibility, overlays,
  and underwriting rules. Use it for "how/why/what are the rules" questions.

When a question needs BOTH policy context AND a live rate (e.g. "FHA credit overlay and
the current 30-year FHA rate"), call BOTH tools in the same turn — retrieve for policy,
getMortgageRate for the number.

Never invent or guess a live rate — always call getMortgageRate. Ground policy answers in
retrieved documents. If a tool returns an error, tell the user you could not get the data
rather than making a number up. Keep answers concise.`;

const REASONING_PROMPT = `You are a mortgage-lending assistant synthesizing tool results into a final answer.

You have already called tools and received their results in the conversation. Your job now:
- Quote live rates ONLY from getMortgageRate results.
- Ground policy/eligibility claims ONLY in retrieve results.
- Combine both when the user asked for rules and a number.
- If a tool failed, say so — do not invent data.
- Answer directly and concisely. Do not call tools again unless the user clearly needs
  additional data that is still missing from the tool results you already have.`;

function systemPrompt(purpose: LLMCallRecord["purpose"]): string {
  return purpose === "reasoning" ? REASONING_PROMPT : AGENT_PROMPT;
}

export const truncate = (s: string, n = 600) => (s.length > n ? s.slice(0, n) + "…" : s);

export function textOf(message: AgentMessage | undefined): string {
  if (!message) return "";
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

// The base chat-model type doesn't declare a `tools` call option, but concrete
// models (ChatAnthropic) accept one and test doubles ignore it. Passing tools
// this way keeps `model.invoke` the single seam that tests can stub, unlike
// bindTools which wraps the model in a new runnable.
const withTools = (options: { tools: typeof BINDABLE_TOOLS }): BaseChatModelCallOptions =>
  options as unknown as BaseChatModelCallOptions;

/** Shared LLM invocation with internal capture; wrapped in an OTel span (Phase 6+). */
export function makeLlmNode(model: BaseChatModel, purpose: LLMCallRecord["purpose"]) {
  const spanName = llmSpanName(purpose);

  return async function llmNode(state: AgentState): Promise<Partial<AgentState>> {
    return withSpan(spanName, async (span) => {
      const input = [new SystemMessage(systemPrompt(purpose)), ...state.messages] as BaseMessage[];
      const started = performance.now();

      try {
        const response = (await model.invoke(input, withTools({ tools: BINDABLE_TOOLS }))) as AIMessage;
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
        setLlmSpanAttrs(span, record);
        console.log(
          `[llm] ${record.purpose} ok model=${record.model} tokens=${record.inputTokens}->${record.outputTokens} latency=${record.latencyMs}ms`,
        );
        return { messages: [toAgentMessage(response)], llmCalls: [record] };
      } catch (err) {
        const latencyMs = Math.round(performance.now() - started);
        const message = err instanceof Error ? err.message : String(err);
        const record: LLMCallRecord = {
          purpose,
          model: MODEL_ID,
          provider: PROVIDER,
          input: truncate(textOf(state.messages.at(-1))),
          output: "",
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          status: "error",
          error: message,
        };
        setLlmSpanAttrs(span, record);
        console.error(`[llm] ${purpose} error after ${latencyMs}ms: ${message}`);
        throw err;
      }
    });
  };
}
