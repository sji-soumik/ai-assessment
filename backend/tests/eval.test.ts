import { describe, expect, test } from "bun:test";
import { AIMessage } from "@langchain/core/messages";
import { BaseChatModel as BaseChatModelClass } from "@langchain/core/language_models/chat_models";
import type { ChatResult } from "@langchain/core/outputs";
import {
  buildJudgePrompt,
  evaluateGroundedness,
  parseVerdict,
} from "../src/obs/eval";
import type { RetrievalRecord, ToolCallRecord } from "../src/agent/state";

class ReplyModel extends BaseChatModelClass {
  constructor(private readonly reply: string | Error) {
    super({});
  }
  override _llmType(): string {
    return "reply";
  }
  override _combineLLMOutput(): never[] {
    return [];
  }
  override async _generate(): Promise<ChatResult> {
    if (this.reply instanceof Error) throw this.reply;
    return { generations: [{ message: new AIMessage(this.reply), text: this.reply }] };
  }
}

const retrievals: RetrievalRecord[] = [
  {
    query: "FHA overlay",
    topK: 4,
    chunkIds: [1],
    documentIds: [2],
    sourcePaths: ["product-overlays.md"],
    similarityScores: [0.8],
    texts: ["FHA requires 580+ credit."],
    latencyMs: 10,
    status: "success",
  },
];

const toolCalls: ToolCallRecord[] = [
  {
    name: "getMortgageRate",
    arguments: { product: "fha", termYears: 30 },
    startedAt: 0,
    endedAt: 1,
    latencyMs: 1,
    result: '{"ratePercent":6.1}',
    status: "success",
  },
];

describe("groundedness judge (Phase 12b)", () => {
  test("parseVerdict checks ungrounded before grounded", () => {
    expect(parseVerdict("grounded")).toBe("grounded");
    expect(parseVerdict("ungrounded")).toBe("ungrounded");
    expect(parseVerdict("UNGROUNDED\n")).toBe("ungrounded");
    expect(parseVerdict("Verdict: grounded")).toBe("grounded");
    expect(parseVerdict("")).toBe("error");
    expect(parseVerdict("maybe")).toBe("error");
  });

  test("skips when there are no retrievals", async () => {
    const verdict = await evaluateGroundedness({
      answer: "Hello",
      retrievals: [],
      toolCalls: [],
      model: new ReplyModel("ungrounded"),
    });
    expect(verdict).toBeNull();
  });

  test("returns grounded from a fake judge", async () => {
    const verdict = await evaluateGroundedness({
      answer: "FHA requires 580+; 30-year FHA is 6.1%.",
      retrievals,
      toolCalls,
      model: new ReplyModel("grounded"),
    });
    expect(verdict).toBe("grounded");
  });

  test("returns ungrounded from a fake judge", async () => {
    const verdict = await evaluateGroundedness({
      answer: "FHA requires a 300 credit score.",
      retrievals,
      toolCalls,
      model: new ReplyModel("ungrounded"),
    });
    expect(verdict).toBe("ungrounded");
  });

  test("judge failure becomes error, never grounded", async () => {
    const verdict = await evaluateGroundedness({
      answer: "anything",
      retrievals,
      toolCalls,
      model: new ReplyModel(new Error("boom")),
    });
    expect(verdict).toBe("error");
  });

  test("judge prompt includes documents and tool results", () => {
    const prompt = buildJudgePrompt({
      answer: "FHA overlay is 580+ and the rate is 6.1%.",
      retrievals,
      toolCalls,
    });
    expect(prompt).toContain("product-overlays.md");
    expect(prompt).toContain("getMortgageRate");
    expect(prompt).toContain("6.1");
    expect(prompt).toContain("FHA overlay is 580+");
  });
});
