"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkHealth, sendChat } from "@/lib/api";
import { buildPipelineSteps, LOADING_PIPELINE } from "@/lib/pipeline";
import type { ChatMessage, ChatResponse } from "@/lib/types";
import { AgentPipeline } from "./AgentPipeline";
import { CapturePanel } from "./CapturePanel";

const STARTERS = [
  "What is the current base rate?",
  "What is our FHA credit overlay?",
  "Get the 30-year conventional mortgage rate.",
];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [loadIndex, setLoadIndex] = useState(0);
  const [activeCapture, setActiveCapture] = useState<ChatResponse | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshHealth = useCallback(async () => {
    setBackendOk(await checkHealth());
  }, []);

  useEffect(() => {
    void refreshHealth();
    const id = setInterval(() => void refreshHealth(), 15_000);
    return () => clearInterval(id);
  }, [refreshHealth]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Cycle loading pipeline animation while waiting for backend.
  useEffect(() => {
    if (!loading) return;
    setLoadIndex(0);
    const id = setInterval(() => {
      setLoadIndex((i) => (i + 1) % LOADING_PIPELINE.length);
    }, 900);
    return () => clearInterval(id);
  }, [loading]);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    setLoading(true);
    setActiveCapture(null);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    try {
      const capture = await sendChat(trimmed);
      setActiveCapture(capture);
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          content: capture.reply,
          capture,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(input);
    }
  }

  const pipelineSteps = activeCapture
    ? buildPipelineSteps(activeCapture)
    : loading
      ? LOADING_PIPELINE
      : [];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* ——— Chat column ——— */}
      <section className="flex min-h-0 flex-1 flex-col border-b border-zinc-800 lg:border-b-0 lg:border-r">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Mortgage Agent</h1>
            <p className="text-[11px] text-zinc-500">LangGraph · Claude · RAG · Tools</p>
          </div>
          <BackendStatus ok={backendOk} onRefresh={() => void refreshHealth()} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !loading && (
            <div className="mx-auto max-w-lg pt-8 text-center">
              <p className="mb-1 text-lg font-medium text-zinc-200">Ask about rates or policy</p>
              <p className="mb-6 text-sm text-zinc-500">
                Live rates come from <code className="text-amber-400/90">getMortgageRate</code>.
                Policy docs from <code className="text-sky-400/90">retrieve</code> (pgvector).
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void submit(q)}
                    className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="mx-auto max-w-2xl space-y-4">
            {messages.map((msg) => (
              <li
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-violet-600/90 text-white"
                      : "border border-zinc-800 bg-zinc-900/80 text-zinc-200"
                  }`}
                >
                  {msg.content}
                  {msg.capture && (
                    <button
                      type="button"
                      onClick={() => setActiveCapture(msg.capture!)}
                      className="mt-2 block text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                    >
                      View capture · {msg.capture.durationMs}ms
                    </button>
                  )}
                </div>
              </li>
            ))}

            {loading && (
              <li className="flex justify-start">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                  <p className="mb-1 text-xs text-zinc-500">Agent running…</p>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-2 w-2 rounded-full bg-violet-500/70 animate-bounce-dot"
                        style={{ animationDelay: `${d * 120}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </li>
            )}
          </ul>
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="shrink-0 border-t border-zinc-800 p-4">
          <div className="mx-auto flex max-w-2xl gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a mortgage question…"
              rows={2}
              disabled={loading}
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void submit(input)}
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      {/* ——— Observability column ——— */}
      <aside className="flex w-full shrink-0 flex-col lg:w-[420px] xl:w-[480px]">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Agent pipeline
          </h2>
          {activeCapture?.flow && activeCapture.flow.length > 0 && !loading && (
            <FlowBadge flow={activeCapture.flow} durationMs={activeCapture.durationMs} />
          )}
        </div>
        <div className="max-h-[280px] overflow-y-auto border-b border-zinc-800 px-4 py-4 lg:max-h-none lg:shrink-0">
          {pipelineSteps.length > 0 ? (
            <AgentPipeline
              steps={pipelineSteps}
              loading={loading}
              activeLoadIndex={loadIndex}
            />
          ) : (
            <p className="text-xs text-zinc-600">
              Send a message to see the LangGraph path: agent → retrieval / tool → reasoning →
              response.
            </p>
          )}
        </div>

        <div className="flex min-h-[240px] flex-1 flex-col border-b border-zinc-800 lg:min-h-0">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Internal capture
            </h2>
          </div>
          <div className="min-h-0 flex-1">
            {activeCapture ? (
              <CapturePanel capture={activeCapture} />
            ) : loading ? (
              <div className="flex h-full items-center justify-center p-6">
                <p className="animate-pulse text-xs text-zinc-500">Waiting for capture data…</p>
              </div>
            ) : (
              <p className="p-4 text-xs leading-relaxed text-zinc-600">
                LLM tokens, RAG chunks (ids + scores), and tool args/results appear here after each
                response.
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function FlowBadge({ flow, durationMs }: { flow: string[]; durationMs: number }) {
  const isComplete =
    flow.includes("llm.agent") &&
    flow.includes("retrieval") &&
    flow.some((s) => s.startsWith("tool.")) &&
    flow.includes("llm.reasoning") &&
    flow.includes("respond");

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {flow.map((step, i) => (
          <span key={`${step}-${i}`} className="flex items-center gap-1">
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                step.startsWith("llm.")
                  ? "bg-violet-500/15 text-violet-400"
                  : step === "retrieval"
                    ? "bg-sky-500/15 text-sky-400"
                    : step.startsWith("tool.")
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {step}
            </span>
            {i < flow.length - 1 && <span className="text-zinc-700">→</span>}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-zinc-600">
        {durationMs}ms total
        {isComplete && (
          <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-500">
            complete flow (P5)
          </span>
        )}
      </p>
    </div>
  );
}

function BackendStatus({ ok, onRefresh }: { ok: boolean | null; onRefresh: () => void }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-[10px] text-zinc-400 transition hover:border-zinc-700"
      title="Click to refresh backend status"
    >
      <span
        className={`h-2 w-2 rounded-full ${
          ok === null ? "bg-zinc-600 animate-pulse" : ok ? "bg-emerald-500" : "bg-red-500"
        }`}
      />
      {ok === null ? "Checking…" : ok ? "Backend online" : "Backend offline"}
    </button>
  );
}
