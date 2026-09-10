# AI Observability Assessment

A TypeScript LangGraph agent for mortgage-lending questions (base rates, rate sheets, products), with a planned full observability stack: per-request traces in Arize Phoenix and Prometheus/Grafana dashboards.

**Build order:** working agent first, observability later. Phases 1–10 (agent + OpenTelemetry spans + Phoenix OTLP export) are done. Prometheus and Grafana are next.

## Current status

| Phase | What | Status |
|---|---|---|
| P1 | LangGraph agent, routing, respond node, basic conversation | Done |
| P2 | Real Claude call; model / tokens / latency / error captured in graph state + console | Done |
| P3 | PostgreSQL + pgvector RAG; ingest / chunk / embed / similarity search / top-K; query, chunk+document ids, scores, latency captured | Done |
| P4 | `getMortgageRate` tool (in-process rate table); name / args / start / end / latency / result / status / error captured | Done |
| P5 | Complete flow: one request can run LLM → retrieval → tool → reasoning → answer; `flow` summary on CLI + `/chat` | Done |
| P6–P9 | OpenTelemetry: root `agent` span + children (`llm.call`, `retrieval`, `tool.call`, `llm.reasoning`, `final.response`) with full attrs + cost | Done |
| P10 | Arize Phoenix OTLP export; CLI flush + server SIGINT/SIGTERM shutdown | Done |
| P11–P18 | Starred Phoenix walkthrough, Prometheus, Grafana, failure tests | Not started |

One request can trigger **multiple AI operations** before the final answer. Example that exercises the full path:

```bash
bun run chat "What is the FHA credit overlay and the current 30-year FHA rate?"
# flow: llm.agent → retrieval → tool.getMortgageRate → llm.reasoning → respond
```

See [`CONTEXT.md`](CONTEXT.md) for the domain glossary.

## Architecture

**Today**

```
USER ──POST /chat {message}──► Bun server :3000
                                 │
                                 ▼
             LangGraph  START → agent ─┬─ retrieval → tool → reasoning ─┐
                                       ├─ tool ─────────→ reasoning ────┤
                                       └─ respond → END ◄───────────────┘
                                 │                    │
                          Claude Opus 5      retrieve → pgvector (chunks)
                                             getMortgageRate → rate table
              llmCalls / retrievals / toolCalls captured in graph state
                                 │
                    OpenTelemetry (explicit withSpan)
                                 │
                         OTLP → Phoenix :6006
```

**Target** (after later phases)

```
USER ──POST /chat {message, scenario?}──┐
                                        ▼
                         TypeScript LangGraph Agent (Bun, :3000)
                            START → agent → decision
                              ├─ retrieval / getMortgageRate → agent (reasoning loop)
                              └─ respond → END
                                        │
                         OpenTelemetry SDK · prom-client
                            │                        │
              OTLP → Phoenix :6006         GET /metrics ← Prometheus :9090
                                                   │
                                            Grafana :3001
```

## Technology choices

| Piece | Choice | Why |
|---|---|---|
| Runtime | [Bun](https://bun.com) | Spec requires Bun (`Bun.serve`, auto-loaded `.env`). Not Node/npm/Express. |
| Agent | LangGraph (`@langchain/langgraph`) | Explicit graph: agent → retrieval/tool → reasoning → respond |
| LLM | Claude `claude-opus-5` via `@langchain/anthropic` | Single construction point in `src/llm.ts`. Do not set `temperature` / `top_p` / `top_k` (API returns 400). |
| Vector DB (planned) | PostgreSQL + pgvector | Plan requirement. Local 512-dim hash-n-gram embeddings (no extra API keys). |
| Traces | Arize Phoenix over OTLP | Self-hosted, no extra account. Langfuse is a documented OTLP-endpoint swap (set `OTEL_EXPORTER_OTLP_ENDPOINT`). |
| Metrics (planned) | Prometheus + Grafana | Four dashboards: Performance, Cost, Reliability, Quality. |

Cost math (used from P7): **$5 / 1M input tokens**, **$25 / 1M output tokens**.

## Prerequisites

- [Bun](https://bun.sh) v1.3+
- An [Anthropic API key](https://console.anthropic.com/) for live chat (tests without the key still run against a fake model)
- Docker (for the P3 PostgreSQL + pgvector container)

Phoenix is required for the P10 trace demo (compose starts it on :6006). Prometheus and Grafana are not required until later phases. To run the agent with compose down, set `OTEL_SDK_DISABLED=true` so the SDK stays a noop and `/chat` still works.

## Setup

```bash
cd backend
bun install
cp .env.example .env
# set ANTHROPIC_API_KEY in .env (DATABASE_URL is pre-filled for the local container)

# P3 RAG + P10 traces: start pgvector and Phoenix
docker compose -f ops/docker-compose.yml up -d
bun run ingest
# OTEL_EXPORTER_OTLP_ENDPOINT is pre-filled in .env.example
# Optional: OTEL_SDK_DISABLED=true when Phoenix is not running
```

Bun loads `.env` automatically. Never commit `.env`.

## Run

From `backend/`:

```bash
# HTTP server on :3000 (hot reload)
bun run dev

# One-shot CLI conversation (prints LLM / retrieval / tool capture)
bun run chat "What is the current base rate?"

# Ingest the RAG corpus into pgvector (idempotent)
bun run ingest

# Tests (live Claude + DB-backed retrieval tests auto-skip when their env is unset)
bun test
```

### Web UI (`frontend/`)

Next.js chat on **http://localhost:3001** — animated LangGraph pipeline plus LLM / RAG / tool capture panels. Proxies to the backend via `/api/chat` (no CORS).

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev   # :3001 → backend :3000
```

See [`frontend/README.md`](frontend/README.md).

### HTTP API

**`GET /health`**

```json
{ "ok": true }
```

**`POST /chat`**

```bash
curl -s http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"What is the current base rate?"}'
```

```json
{
  "reply": "The base rate is 6.0% …",
  "flow": ["llm.agent", "retrieval", "tool.getMortgageRate", "llm.reasoning", "respond"],
  "llmCalls": [
    { "purpose": "agent", "model": "claude-opus-5", "provider": "anthropic",
      "inputTokens": 120, "outputTokens": 40, "latencyMs": 1800, "status": "success" },
    { "purpose": "reasoning", "model": "claude-opus-5", "provider": "anthropic",
      "inputTokens": 210, "outputTokens": 55, "latencyMs": 1600, "status": "success" }
  ],
  "retrievals": [
    { "query": "FHA credit overlay", "topK": 4,
      "chunkIds": [15, 13], "documentIds": [3, 2],
      "sourcePaths": ["product-overlays.md", "base-rate-pricing.md"],
      "similarityScores": [0.18, 0.09], "latencyMs": 28, "status": "success" }
  ],
  "toolCalls": [
    { "name": "getMortgageRate", "arguments": { "product": "base", "termYears": 30 },
      "latencyMs": 1, "result": "{\"product\":\"base\",\"termYears\":30,\"ratePercent\":6.0,…}",
      "status": "success" }
  ],
  "durationMs": 3450
}
```

`retrievals` and `toolCalls` are empty when a request answers directly. Missing
`message` or invalid JSON → `400`. LLM/provider errors → `500`. Successful
`/chat` responses include `traceId` (hex) so you can look up the same request in Phoenix.

### Trace demo (P10)

End-to-end: one complete-flow question produces a **single `traceId`** with six span types (`agent`, `llm.call`, `retrieval`, `tool.call`, `llm.reasoning`, `final.response`).

```bash
cd backend
docker compose -f ops/docker-compose.yml up -d   # postgres + phoenix
bun run ingest                                   # RAG corpus for retrieval
bun run chat "FHA overlay and 30-year FHA rate?"
# copy the printed traceId
```

Open [http://localhost:6006](http://localhost:6006) → find that `traceId` → confirm nesting and attributes:

| Span | What to read |
|---|---|
| `llm.call` / `llm.reasoning` | model, tokens, `llm.cost_usd`, status (Claude Opus 5 has no numeric temperature — sampling is model-default) |
| `retrieval` | query, document count, similarity scores, latency, status |
| `tool.call` | name, arguments, result, latency, status |
| `final.response` | answer text |

The HTTP server flushes the OTLP batch on `SIGINT` / `SIGTERM`. The CLI flushes and shuts down telemetry before exit. With Phoenix **down**, requests still succeed (export is async); set `OTEL_SDK_DISABLED=true` locally if export logs are noisy.

Langfuse is not a second SDK — point `OTEL_EXPORTER_OTLP_ENDPOINT` at a Langfuse OTLP URL if you pivot later. Phoenix's `/v1/traces` ingest accepts **OTLP protobuf** (`application/x-protobuf`), not JSON.

## Project layout

```
ai-assessment/
├── README.md                 # this file
├── CONTEXT.md                # domain glossary (base rate, mortgage rate, Document, Chunk…)
├── docs/adr/                 # architecture decision records
├── frontend/                 # Next.js UI (:3001) — chat + pipeline + capture panels
└── backend/
    ├── SPEC.md               # phase plan, gates, architecture
    ├── AGENT.md              # operating guide for agents working in this repo
    ├── ops/                  # docker-compose.yml (pgvector + Phoenix; Prometheus/Grafana later)
    ├── rag/docs/             # policy corpus ingested into pgvector
    ├── src/
    │   ├── llm.ts            # Claude model factory (only construction point)
    │   ├── server.ts         # Bun.serve: POST /chat, GET /health
    │   ├── chat.ts           # CLI one-shot conversation
    │   ├── rag/              # embeddings, chunking, pgvector db, ingest, similarity search
    │   ├── tools/            # getMortgageRate (in-process rate table)
    │   ├── obs/              # otel.ts, spans.ts, attrs.ts, cost.ts
    │   └── agent/
    │       ├── graph.ts      # StateGraph wiring
    │       ├── flow.ts       # Phase 5 flow summary (llm → retrieval → tool → reasoning)
    │       ├── state.ts      # messages, llmCalls[], retrievals[], toolCalls[], finalAnswer
    │       ├── tools.ts      # tool specs bound onto the model
    │       └── nodes/        # llm, route, retrieval, tool, respond, pending
    └── tests/                # graph, RAG, and tool tests + live/DB smoke tests
```

Later phases add `chaos.ts`, extend `ops/` (Prometheus, Grafana), and metrics in `obs/`.

## What's next

Work phase-by-phase from [`backend/SPEC.md`](backend/SPEC.md). Next up:

1. **P11** — Starred end-to-end trace walkthrough (same Phoenix steps as [Trace demo](#trace-demo-p10) above)
2. **P12+** — Prometheus metrics, Grafana dashboards, failure scenarios

The final README (P18) will add a live trace walkthrough, Grafana screenshots, failure-scenario results, and a fresh-checkout runbook.

## Docs

- [`backend/SPEC.md`](backend/SPEC.md) — 18-phase tracker, decisions, and gates
- [`backend/AGENT.md`](backend/AGENT.md) — conventions for anyone (or any agent) changing this repo
- [`backend/.env.example`](backend/.env.example) — environment variables
