"use client";

import { useState } from "react";
import type { LLMCallRecord, RetrievalRecord, ToolCallRecord, ChatResponse } from "@/lib/types";

type Tab = "llm" | "rag" | "tools" | "raw";

interface CapturePanelProps {
  capture: ChatResponse;
}

export function CapturePanel({ capture }: CapturePanelProps) {
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "llm", label: "LLM", count: capture.llmCalls.length },
    { id: "rag", label: "RAG", count: capture.retrievals.length },
    { id: "tools", label: "Tools", count: capture.toolCalls.length },
    { id: "raw", label: "JSON", count: 0 },
  ];

  return (
    <CaptureTabs
      capture={capture}
      tabs={tabs.filter((t) => t.id === "raw" || t.id === "llm" || t.count > 0)}
    />
  );
}

function CaptureTabs({
  capture,
  tabs,
}: {
  capture: ChatResponse;
  tabs: { id: Tab; label: string; count: number }[];
}) {
  const [active, setActive] = useState<Tab>(tabs[0]?.id ?? "llm");

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-zinc-800 px-1 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`rounded-t-lg px-3 py-2 text-xs font-medium transition-colors ${
              active === tab.id
                ? "bg-zinc-900 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px]">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {active === "llm" && <LLMPanel calls={capture.llmCalls} />}
        {active === "rag" && <RAGPanel retrievals={capture.retrievals} />}
        {active === "tools" && <ToolsPanel tools={capture.toolCalls} />}
        {active === "raw" && (
          <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-400">
            {JSON.stringify(capture, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "success" | "error" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        status === "success" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
      }`}
    >
      {status}
    </span>
  );
}

function LLMPanel({ calls }: { calls: LLMCallRecord[] }) {
  if (calls.length === 0) {
    return <EmptyCapture message="No LLM calls on this turn (direct answer path)." />;
  }

  return (
    <div className="space-y-3">
      {calls.map((call, i) => (
        <div
          key={`${call.purpose}-${i}`}
          className="capture-card-enter rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-violet-400">{call.purpose}</span>
            <StatusBadge status={call.status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <Row label="Model" value={call.model} />
            <Row label="Provider" value={call.provider} />
            <Row label="Input tokens" value={String(call.inputTokens)} />
            <Row label="Output tokens" value={String(call.outputTokens)} />
            <Row label="Latency" value={`${call.latencyMs}ms`} mono />
          </dl>
          {call.input && <Block label="Input" text={call.input} />}
          {call.output && <Block label="Output" text={call.output} />}
          {call.error && <Block label="Error" text={call.error} error />}
        </div>
      ))}
    </div>
  );
}

function RAGPanel({ retrievals }: { retrievals: RetrievalRecord[] }) {
  if (retrievals.length === 0) {
    return (
      <EmptyCapture message="No retrieval on this turn — the agent did not search the knowledge base." />
    );
  }

  return (
    <div className="space-y-3">
      {retrievals.map((r, i) => (
        <div
          key={`retrieval-${i}`}
          className="capture-card-enter rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-sky-400">pgvector search</span>
            <StatusBadge status={r.status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <Row label="Query" value={r.query} />
            <Row label="Top-K" value={String(r.topK)} />
            <Row label="Latency" value={`${r.latencyMs}ms`} mono />
            <Row label="Hits" value={String(r.chunkIds.length)} />
          </dl>

          {r.chunkIds.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Retrieved chunks
              </p>
              {r.chunkIds.map((chunkId, j) => (
                <div
                  key={chunkId}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-2"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="font-mono text-sky-400">chunk #{chunkId}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">doc #{r.documentIds[j]}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="font-mono text-emerald-500/80">
                      score {(r.similarityScores[j] ?? 0).toFixed(4)}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400">{r.sourcePaths[j]}</p>
                  {r.texts[j] && (
                    <p className="mt-1 line-clamp-3 text-[10px] leading-relaxed text-zinc-500">
                      {r.texts[j]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {r.error && <Block label="Error" text={r.error} error />}
        </div>
      ))}
    </div>
  );
}

function ToolsPanel({ tools }: { tools: ToolCallRecord[] }) {
  if (tools.length === 0) {
    return <EmptyCapture message="No tool calls on this turn." />;
  }

  return (
    <div className="space-y-3">
      {tools.map((tool, i) => {
        let parsed: unknown = tool.result;
        try {
          parsed = JSON.parse(tool.result);
        } catch {
          /* keep string */
        }

        return (
          <div
            key={`${tool.name}-${tool.startedAt}`}
            className="capture-card-enter rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <span className="inline-block">🔧</span>
                {tool.name}
              </span>
              <StatusBadge status={tool.status} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <Row label="Latency" value={`${tool.latencyMs}ms`} mono />
              <Row label="Started" value={new Date(tool.startedAt).toLocaleTimeString()} mono />
            </dl>
            <Block label="Arguments" text={JSON.stringify(tool.arguments, null, 2)} mono />
            <Block
              label="Result"
              text={
                typeof parsed === "object" && parsed !== null
                  ? JSON.stringify(parsed, null, 2)
                  : tool.result
              }
              mono
            />
            {tool.error && <Block label="Error" text={tool.error} error />}
          </div>
        );
      })}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-zinc-600">{label}</dt>
      <dd className={`truncate text-zinc-300 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </>
  );
}

function Block({
  label,
  text,
  error,
  mono,
}: {
  label: string;
  text: string;
  error?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        {label}
      </p>
      <p
        className={`whitespace-pre-wrap rounded-lg bg-zinc-950/80 p-2 text-[10px] leading-relaxed ${
          error ? "text-red-400" : "text-zinc-400"
        } ${mono ? "font-mono" : ""}`}
      >
        {text}
      </p>
    </div>
  );
}

function EmptyCapture({ message }: { message: string }) {
  return <p className="text-xs leading-relaxed text-zinc-500">{message}</p>;
}
