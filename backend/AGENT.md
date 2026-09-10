# AGENT.md — AI Observability Assessment

Operating guide for any AI agent working in this repo. The authoritative phase plan + status tracker lives in [SPEC.md](SPEC.md) — **read it first, work phase-by-phase, tick the tracker as gates pass**.

## What this is

A TypeScript **LangGraph agent** for a **mortgage-lending domain** (base rates, rate sheets, products) that per request runs: LLM call → RAG retrieval → tool call → LLM reasoning → final answer. Then full-stack observability:

```
Agent → OpenTelemetry ──OTLP──► Arize Phoenix      (per-request trace investigation)
      → prom-client ──/metrics─► Prometheus → Grafana  (4 dashboards: Performance · Cost · Reliability · Quality)
```

Proven useful via 5 failure tests: **slow tool, tool failure, bad retrieval, token-heavy prompt, LLM timeout.**

## Build order (non-negotiable)

**Agent first, observability later.** No OTel/metrics code before SPEC phases P1–P5 are done and manually verified. Fault injection stays isolated in `chaos.ts` (off unless `scenario` is set).

## Runtime rules (non-negotiable)

- **Bun, not Node.** `bun install` / `bun run` / `bun test` / `Bun.serve()`. Never npm, node, ts-node, jest, express, dotenv (Bun auto-loads `.env`), `pg` (use `Bun.sql`) — see CLAUDE.md.
- **LLM = `claude-opus-5`** via `@langchain/anthropic` (`src/llm.ts` is the only place the model is constructed). Cost math: $5/M input, $25/M output tokens.
- **Never set `temperature` / `top_p` / `top_k`** — removed on Opus 5, returns 400. Leave `thinking` unset (adaptive default).
- **Vector DB = PostgreSQL + pgvector** (from P3). Embeddings are local deterministic hash-n-gram vectors — no extra API keys.
- Parse tool-call inputs as JSON only; never string-match serialized input.
- **Never commit `.env`**; no secrets or free-text user input in span attrs used as metric labels.

## Commands

| Command | Purpose |
|---|---|
| `bun install` | install deps |
| `bun run dev` | agent server on :3000 (`--hot`) |
| `bun run chat "question"` | one-shot CLI conversation with internal capture printout |
| `bun test` | fake-model graph tests + live smoke test (auto-skipped without `ANTHROPIC_API_KEY`) |
| `docker compose up -d` | Postgres+pgvector, Phoenix, Prometheus, Grafana (:3002) |
| `bun run demo <scenario>` | P14 failure-scenario runner (`slow_tool`, `tool_failure`, `bad_retrieval`, `token_heavy`, `llm_timeout`) |

## Repo layout

```
src/
  llm.ts               # model factory (single construction point)
  server.ts            # Express: POST /chat, GET /health, GET /metrics
  chat.ts              # CLI one-shot conversation (prints Phase 11 trace tree)
  agent/state.ts       # Annotation state: messages, llmCalls[], finalAnswer
  agent/invoke.ts      # request wrapper: root span + metrics + groundedness judge
  agent/graph.ts       # StateGraph wiring; buildGraph(model?) for test injection
  rag/                 # P3: ingestion, chunking, embeddings, pgvector store
  tools/               # P4: getMortgageRate
  obs/                 # otel.ts, spans.ts, metrics.ts, eval.ts, cost.ts, traceTree.ts, requestContext.ts
  chaos.ts             # P14: scenario → fault injection (single source of truth)
  demo.ts              # P14: bun run demo <scenario>
tests/                 # agent, retrieval, tool, timeout, observability, metrics, eval
ops/                   # docker-compose.yml, prometheus.yml, grafana provisioning
```

## Conventions

- **Spans (P6+):** root `agent`; children `llm.call`, `retrieval`, `tool.call`, `llm.reasoning`, `final.response`. GenAI semconv attrs on LLM spans (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens/output_tokens`) + `llm.cost_usd`. Errors → `recordException` + `ERROR` status, then rethrow.
- **Metrics (P12+):** exact names from SPEC P12; snake_case, base units, bounded label values only (`status`, `purpose`, `tool` name, sanitized `user`). Grafana is on :3002.
- **Groundedness:** LLM-as-judge after the root `agent` span (metrics-only — do not add an eval span to the P11 tree). `agent_groundedness_total{verdict}`; never invent `grounded`. Judge tokens stay out of `llm_*` counters.
- **Errors are data:** a failed tool returns an error `ToolMessage` so the LLM can react; only LLM timeout fails the whole request. Every failure still produces a complete trace.
- **Capture-before-telemetry (P1–P5):** LLM/tool/retrieval internals (model, tokens, latency, status, error…) are recorded into graph state (`llmCalls` etc.) and logged — OTel later reads from the same seams.
- TypeScript strict; use LangChain/SDK types (`AIMessage`, `ToolMessage`, `BaseChatModel`…) — don't redefine equivalents. Test graph logic with `FakeListChatModel` injection via `buildGraph(model)`.

## Environment

`ANTHROPIC_API_KEY` (required) · `DATABASE_URL` (P3+) · `OTEL_EXPORTER_OTLP_ENDPOINT` (P6+, default `http://localhost:6006/v1/traces`) · `PORT` (default 3000). See `.env.example`.

## Definition of done

Every SPEC phase gate met in order; final gates are the ⭐ end-to-end trace demo (P11), the 5 failure signatures visible in both Phoenix and Grafana (P14), the 10-point automated verification (P16), and the 7-section README (P18).
