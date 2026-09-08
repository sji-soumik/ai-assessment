import { AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseChatModel as BaseChatModelClass } from "@langchain/core/language_models/chat_models";
import type { ChatResult } from "@langchain/core/outputs";
import { toAgentMessage } from "../src/agent/messages";
import { textOf } from "../src/agent/nodes/llm";

/**
 * Test double that returns a predefined sequence of AIMessages across invoke() calls.
 * Used for multi-step graph paths (tool call → reasoning) without live LLM access.
 */
export class SequenceChatModel extends BaseChatModelClass {
  private index = 0;

  constructor(private readonly sequence: AIMessage[]) {
    super({});
  }

  override _llmType(): string {
    return "sequence";
  }

  override _combineLLMOutput(): never[] {
    return [];
  }

  override async _generate(): Promise<ChatResult> {
    const message = this.sequence[this.index] ?? this.sequence.at(-1)!;
    if (this.index < this.sequence.length - 1) this.index += 1;
    return { generations: [{ message, text: textOf(toAgentMessage(message)) }] };
  }
}

export function sequenceModel(messages: AIMessage[]): BaseChatModel {
  return new SequenceChatModel(messages);
}
