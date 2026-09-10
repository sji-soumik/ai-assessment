"use client";

import type { PipelineStep, PipelineStepKind } from "@/lib/types";

const KIND_META: Record<
  PipelineStepKind,
  { icon: string; color: string; ring: string; bg: string }
> = {
  agent: {
    icon: "🧠",
    color: "text-violet-400",
    ring: "ring-violet-500/40",
    bg: "bg-violet-500/10",
  },
  retrieval: {
    icon: "📚",
    color: "text-sky-400",
    ring: "ring-sky-500/40",
    bg: "bg-sky-500/10",
  },
  tool: {
    icon: "🔧",
    color: "text-amber-400",
    ring: "ring-amber-500/40",
    bg: "bg-amber-500/10",
  },
  reasoning: {
    icon: "💭",
    color: "text-fuchsia-400",
    ring: "ring-fuchsia-500/40",
    bg: "bg-fuchsia-500/10",
  },
  response: {
    icon: "✓",
    color: "text-emerald-400",
    ring: "ring-emerald-500/40",
    bg: "bg-emerald-500/10",
  },
};

interface AgentPipelineProps {
  steps: PipelineStep[];
  loading?: boolean;
  activeLoadIndex?: number;
}

export function AgentPipeline({ steps, loading, activeLoadIndex = 0 }: AgentPipelineProps) {
  const displaySteps = loading
    ? steps.map((s, i) => ({
        ...s,
        status:
          i < activeLoadIndex
            ? ("done" as const)
            : i === activeLoadIndex
              ? ("active" as const)
              : ("pending" as const),
      }))
    : steps;

  return (
    <div className="space-y-0">
      {displaySteps.map((step, index) => {
        const meta = KIND_META[step.kind];
        const isLast = index === displaySteps.length - 1;

        return (
          <div key={step.id} className="relative flex gap-3">
            {/* connector line */}
            {!isLast && (
              <div
                className={`absolute left-[19px] top-10 bottom-0 w-0.5 ${
                  step.status === "done"
                    ? "bg-gradient-to-b from-emerald-500/60 to-zinc-700"
                    : step.status === "active"
                      ? "pipeline-line-active"
                      : "bg-zinc-800"
                }`}
              />
            )}

            {/* node */}
            <div
              className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg transition-all duration-500 ${meta.bg} ${
                step.status === "active"
                  ? `border-transparent ring-2 ${meta.ring} animate-pulse-glow`
                  : step.status === "done"
                    ? "border-emerald-500/30"
                    : step.status === "error"
                      ? "border-red-500/50 bg-red-500/10"
                      : "border-zinc-800 opacity-40"
              }`}
            >
              <span
                className={
                  step.kind === "tool" && step.status === "active" ? "animate-tool-spin" : ""
                }
              >
                {step.status === "error" ? "!" : meta.icon}
              </span>
              {step.status === "active" && step.kind === "retrieval" && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-sky-400 animate-ping" />
              )}
            </div>

            {/* label */}
            <div className={`min-w-0 flex-1 pb-6 ${step.status === "pending" && loading ? "opacity-40" : ""}`}>
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${meta.color}`}>{step.label}</p>
                {step.latencyMs !== undefined && step.status !== "pending" && (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                    {step.latencyMs}ms
                  </span>
                )}
                {step.status === "active" && (
                  <span className="flex gap-0.5">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce-dot"
                        style={{ animationDelay: `${d * 150}ms` }}
                      />
                    ))}
                  </span>
                )}
              </div>
              {step.detail && (
                <p className="mt-0.5 truncate text-xs text-zinc-500">{step.detail}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
