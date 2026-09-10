import { describe, expect, test } from "bun:test";
import { AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseChatModel as BaseChatModelClass } from "@langchain/core/language_models/chat_models";
import type { ChatResult } from "@langchain/core/outputs";
import { buildGraph } from "../src/agent/graph";
import { AgentInvokeError, invokeAgent } from "../src/agent/invoke";
import { LLM_TIMEOUT_MESSAGE } from "../src/chaos";
import { isLlmTimeout, register, resetMetrics } from "../src/obs/metrics";

class TimeoutChatModel extends BaseChatModelClass {
  override _llmType(): string {
    return "timeout";
  }

  override _combineLLMOutput(): never[] {
    return [];
  }

  override async _generate(): Promise<ChatResult> {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  }
}

function timeoutModel(): BaseChatModel {
  return new TimeoutChatModel({});
}

describe("LLM timeout (Phase 14 / 16)", () => {
  test("isLlmTimeout detects AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isLlmTimeout(err)).toBe(true);
    expect(isLlmTimeout(new Error("Request timeout"))).toBe(true);
  });

  test("timeout model fails the request with Request timeout and increments llm_timeouts_total", async () => {
    resetMetrics();
    await expect(
      invokeAgent("What is the current base rate?", {
        graph: buildGraph(timeoutModel()),
        scenario: "llm_timeout",
        evaluate: false,
        requestId: "req-timeout",
      }),
    ).rejects.toMatchObject({
      name: "AgentInvokeError",
      message: LLM_TIMEOUT_MESSAGE,
      requestId: "req-timeout",
    });

    const text = await register.metrics();
    expect(text).toMatch(/llm_timeouts_total\s+1/);
    expect(text).toContain('status="error"');
  });

  test("AgentInvokeError still carries traceId", async () => {
    try {
      await invokeAgent("hi", {
        graph: buildGraph(timeoutModel()),
        scenario: "llm_timeout",
        evaluate: false,
        requestId: "req-timeout-2",
      });
      throw new Error("expected timeout");
    } catch (err) {
      expect(err).toBeInstanceOf(AgentInvokeError);
      const wrapped = err as AgentInvokeError;
      expect(wrapped.traceId).toBeDefined();
      expect(wrapped.traceId!.length).toBeGreaterThan(8);
    }
  });
});
