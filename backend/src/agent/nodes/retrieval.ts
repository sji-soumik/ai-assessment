import { SpanStatusCode } from "@opentelemetry/api";
import { ToolMessage } from "@langchain/core/messages";
import { toAgentMessages } from "../messages";
import type { AgentMessage, AgentState, RetrievalRecord } from "../state";
import { setRetrievalSpanAttrs } from "../../obs/attrs";
import { recordRetrieval } from "../../obs/metrics";
import { SpanName } from "../../obs/names";
import { currentTraceId } from "../../obs/otel";
import { correlationPrefix } from "../../obs/requestContext";
import { withSpan } from "../../obs/spans";
import { DEFAULT_TOP_K, similaritySearch, type RetrievalHit } from "../../rag/search";
import { truncate } from "./llm";
import { pendingToolCalls } from "./pending";
import { isRetrievalTool } from "./route";

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Render hits into readable context the LLM can ground its answer in. */
function formatHits(hits: RetrievalHit[]): string {
  if (hits.length === 0) {
    return "No relevant knowledge-base documents were found for this query.";
  }
  return hits
    .map(
      (hit, i) =>
        `[${i + 1}] source=${hit.sourcePath} score=${round4(hit.score)}\n${hit.content}`,
    )
    .join("\n\n");
}

/**
 * Retrieval node (Phase 3): pgvector similarity search for each pending
 * `retrieve` call. Captures query, documents, ids, scores, top-K, and latency
 * into state.retrievals. A missing/failing DB yields an error ToolMessage so the
 * request still completes (only LLM timeouts fail the whole request).
 */
export async function retrievalNode(state: AgentState): Promise<Partial<AgentState>> {
  const pending = pendingToolCalls(state.messages, isRetrievalTool);
  if (pending.length === 0) return {};

  const messages: AgentMessage[] = [];
  const records: RetrievalRecord[] = [];

  for (const call of pending) {
    const query = typeof call.args.query === "string" ? call.args.query : "";
    const topK = typeof call.args.topK === "number" ? call.args.topK : DEFAULT_TOP_K;

    await withSpan(SpanName.retrieval, async (span) => {
      const started = performance.now();
      let record: RetrievalRecord;

      try {
        const hits = await similaritySearch(query, topK);
        const latencyMs = Math.round(performance.now() - started);
        record = {
          query,
          topK,
          chunkIds: hits.map((h) => h.chunkId),
          documentIds: hits.map((h) => h.documentId),
          sourcePaths: hits.map((h) => h.sourcePath),
          similarityScores: hits.map((h) => round4(h.score)),
          texts: hits.map((h) => truncate(h.content, 300)),
          latencyMs,
          status: "success",
        };
        console.log(
          `${correlationPrefix(currentTraceId())}[retrieval] ok query="${truncate(query, 60)}" hits=${hits.length} topK=${topK} latency=${latencyMs}ms`,
        );
        messages.push(toToolMessage(formatHits(hits), call.id, call.name));
      } catch (err) {
        const latencyMs = Math.round(performance.now() - started);
        const error = err instanceof Error ? err.message : String(err);
        record = {
          query,
          topK,
          chunkIds: [],
          documentIds: [],
          sourcePaths: [],
          similarityScores: [],
          texts: [],
          latencyMs,
          status: "error",
          error,
        };
        console.error(`${correlationPrefix(currentTraceId())}[retrieval] error query="${truncate(query, 60)}" after ${latencyMs}ms: ${error}`);
        messages.push(
          toToolMessage(
            `Retrieval failed: ${error}. No knowledge-base documents are available for this query.`,
            call.id,
            call.name,
          ),
        );
      }

      setRetrievalSpanAttrs(span, record);
      recordRetrieval(record);
      if (record.status === "error") {
        span.setStatus({ code: SpanStatusCode.ERROR, message: record.error });
      }
      records.push(record);
    });
  }

  return { messages: toAgentMessages(messages), retrievals: records };
}

function toToolMessage(content: string, toolCallId: string, name: string): AgentMessage {
  return new ToolMessage(content, toolCallId, name) as unknown as AgentMessage;
}
