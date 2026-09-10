import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { RetrievalRecord, ToolCallRecord } from "../agent/state";
import { makeModel } from "../llm";

export type GroundednessVerdict = "grounded" | "ungrounded" | "error";

const JUDGE_SYSTEM = `You are a groundedness judge for a mortgage-lending assistant.
Reply with exactly one word: grounded or ungrounded.

The answer is grounded if:
- every policy/eligibility claim is supported by the retrieved documents, AND
- every live rate or numeric quote is supported by the tool results (live rates come from getMortgageRate, not the documents).

The answer is ungrounded if it invents policy, numbers, or facts that are not in those sources.
Do not explain. Output only: grounded OR ungrounded.`;

/** Parse a judge reply. Checks "ungrounded" before "grounded" because the latter is a substring. */
export function parseVerdict(text: string): GroundednessVerdict {
  const lower = text.trim().toLowerCase();
  if (!lower) return "error";
  const first = lower.split(/\s+/)[0] ?? "";
  if (first === "ungrounded") return "ungrounded";
  if (first === "grounded") return "grounded";
  if (/\bungrounded\b/.test(lower)) return "ungrounded";
  if (/\bgrounded\b/.test(lower)) return "grounded";
  return "error";
}

export function buildJudgePrompt(input: {
  answer: string;
  retrievals: RetrievalRecord[];
  toolCalls: ToolCallRecord[];
}): string {
  const docs = input.retrievals
    .flatMap((r) =>
      r.texts.map((text, i) => `- ${r.sourcePaths[i] ?? "chunk"} (score=${r.similarityScores[i] ?? "?"}): ${text}`),
    )
    .join("\n");
  const tools = input.toolCalls
    .map((t) => `- ${t.name}(${JSON.stringify(t.arguments)}) => ${t.result}`)
    .join("\n");
  return `Retrieved documents:\n${docs || "(none)"}\n\nTool results:\n${tools || "(none)"}\n\nAnswer:\n${input.answer}`;
}

/**
 * LLM-as-judge groundedness. Returns null when there is nothing to judge
 * (no retrievals, or no model / API key) so callers skip the counter.
 * Failures become `error` — never a fake `grounded`.
 */
export async function evaluateGroundedness(input: {
  answer: string;
  retrievals: RetrievalRecord[];
  toolCalls: ToolCallRecord[];
  model?: BaseChatModel;
}): Promise<GroundednessVerdict | null> {
  if (input.retrievals.length === 0) return null;
  if (!input.model && !process.env.ANTHROPIC_API_KEY) return null;

  try {
    const model = input.model ?? makeModel({ maxTokens: 64, timeoutMs: 15_000 });
    const response = await model.invoke([
      new SystemMessage(JUDGE_SYSTEM),
      new HumanMessage(buildJudgePrompt(input)),
    ]);
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    return parseVerdict(text);
  } catch {
    return "error";
  }
}
