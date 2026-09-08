# SPEC.md — Build Spec v2: AI Observability Proficiency Task

Aligned to the assessor's 18-phase plan (quick checklist: 14 steps). Companion to [AGENT.md](AGENT.md).
Rule #1 from the plan: **build the working agent first — no observability until the agent flow is proven.**

## Status tracker

- [x] **P1 — Agent core**: LangGraph state, agent node, LLM, conditional routing, respond node, basic conversation
- [x] **P2 — LLM calling**: real Claude call; capture model/input/output/tokens/latency/error internally (state + console, no telemetry)
- [x] **P3 — Retrieval/RAG**: PostgreSQL + pgvector; ingestion, chunking, embeddings, similarity search, top-K → LLM. Captures query/topK/chunk+document ids/scores/latency into `state.retrievals`
- [x] **P4 — Tool calling**: `getMortgageRate()` (in-process rate table; `getRateSheet` deliberately dropped — see decisions). Captures name/args/start/end/latency/result/status/error into `state.toolCalls`
- [x] **P5 — Complete flow**: one request triggers multiple AI operations (LLM → retrieval → tool → LLM reasoning → answer). Flow summary in `state` capture + `flow` API field + CLI printout
- [ ] **P6 — OpenTelemetry**: root trace + child spans (`agent`, `llm.call`, `retrieval`, `tool.call`, `llm.reasoning`, `final.response`)
- [ ] **P7 — LLM span attrs**: model, provider, tokens (in/out/total), latency, request/response, status, error, **cost**
- [ ] **P8 — Retrieval span attrs**: query, top_k, document_count, document_ids, similarity_scores, latency, status
- [ ] **P9 — Tool span attrs**: name, arguments, latency, status, result, error
- [ ] **P10 — Trace backend**: **Arize Phoenix** (pick-one rule; see decision below). Langfuse = documented alt
- [ ] **P11 — End-to-end trace demo** ⭐ (the main demo)
- [ ] **P12 — Prometheus**: `agent_requests_total`, `agent_request_duration_seconds`, `llm_requests_total`, `llm_latency_seconds`, `llm_input_tokens_total`, `llm_output_tokens_total`, `tool_requests_total`, `tool_latency_seconds`, `tool_errors_total`, `retrieval_requests_total`, `retrieval_latency_seconds` (+ `llm_cost_dollars_total`, `llm_timeouts_total`)
- [ ] **P13 — Grafana, four dashboards**: Performance · Cost · Reliability · Quality
- [ ] **P14 — Failure testing** ⭐: slow tool (8s), tool failure (connection refused), bad retrieval (scores ~0.2–0.3), token-heavy (80k+ input tokens), LLM timeout
- [ ] **P15 — Correlation IDs**: request ID ↔ trace ID ↔ span IDs, propagated through logs/response headers
- [ ] **P16 — Tests**: `tests/agent|retrieval|tool|timeout|observability.test.ts` + the 10-point verification list
- [ ] **P17 — Final architecture** verified against the target diagram
- [ ] **P18 — README**: problem, architecture, technology choices, trace example, Grafana screenshots, failure scenarios, results

## Key decisions (deltas from the assessor's plan are justified here)

| Topic | Decision | Rationale |
|---|---|---|
| LLM | **Claude `claude-opus-5`** via `@langchain/anthropic` | Plan's "Gemini/OpenAI" is illustrative; this project standardizes on Claude (see AGENT.md guardrails: no `temperature`/`top_p`/`top_k` — 400 on Opus 5). Cost computed at $5/M input, $25/M output |
| Vector DB | **PostgreSQL + pgvector** (`pgvector/pgvector:pg17` in `ops/docker-compose.yml`, Phase 3) | Explicitly prescribed by the plan |
| Embeddings | **Local deterministic hash-n-gram embeddings (512-dim)** stored in pgvector | Zero extra API keys; deterministic `bad_retrieval` demo. Swap point for Voyage/other documented in code |
| Retrieval unit | **Chunk**, not whole Document | Similarity search returns embedded slices; each hit carries its chunk id and source document id. Prevents "4 documents" that are really 4 slices of one file (see `CONTEXT.md`) |
| Tool surface | **Only `getMortgageRate({ product?, termYears? })`** — `getRateSheet`/`searchProperty`/`getBorrowerData` dropped | Single live seam for Phase 14 chaos; live rates own the numbers, RAG owns policy, so a second rate tool would duplicate one or the other |
| Rate source | **In-process rate table**, not HTTP/Postgres | Isolates the tool from the vector store; chaos is a function seam (see `docs/adr/0001-in-process-rate-table.md`) |
| Trace backend | **Arize Phoenix** (self-hosted, single container, OTLP-native) | Plan says pick one. Phoenix chosen because its Option B framing — "demonstrate AI/LLM observability and evaluation capabilities" — is this assessment's purpose; it also needs no account/network and Postgres/ClickHouse/Redis-free. Langfuse alt = config-only OTLP swap, documented in README |
| Instrumentation style | Explicit `withSpan` wrappers (not auto-instrumentation callbacks) | Deterministic span tree, shows proficiency |
| Hallucination rate (Quality dashboard) | LLM-as-judge groundedness check (answer vs retrieved docs), emitted as `agent_groundedness_total{verdict}` and **clearly labeled evaluation-derived** | Plan forbids faking this metric |
| LLM timeout test | Per-request client timeout; chaos sets it below realistic response time to force `AbortError`. Production default 30s documented | Reliably reproducible; plan's "latency: 30 sec" example is the prod-timeout framing |

## Architecture (target, Phase 17)

```
                     USER ──POST /chat {message, scenario?}──┐
                                                             ▼
                                              TypeScript LangGraph Agent (Bun, :3000)
                                                 START → agent → decision
                                                   ├─ tools (retrieval / getMortgageRate) → agent (reasoning loop)
                                                   └─ respond → END
                                                             │
                                              OpenTelemetry SDK (spans) · prom-client (metrics)
                                                   │                          │
                                     OTLP http://phoenix:6006          GET /metrics ← Prometheus :9090
                                                   │                          │
                                          Phoenix Trace Explorer         Grafana :3001 (4 dashboards)
```

Span tree per request (P6–P9): `agent` → { `llm.call`, `retrieval`, `tool.call`, `llm.reasoning`, `final.response` } — each with the attribute sets listed in the tracker above.

## Phase gates

| Phase | Gate |
|---|---|
| P1–P2 | `bun run chat "What is the current base rate?"` → "The base rate is…"-style reply; console shows model, tokens in/out, latency; `bun test` green with fake-model graph tests |
| P3 | `retrieve` returns top-K docs with similarity scores from pgvector; ingestion script idempotent |
| P4 | Agent answers a rate question via `getMortgageRate` round-trip (≥2 LLM calls) |
| P5 | One request demonstrably triggers LLM → retrieval → tool → LLM reasoning before answering |
| P6–P9 | Single trace in Phoenix with correct parent-child nesting and all listed attributes |
| P10–P11 | ⭐ End-to-end trace demo: open one trace ID and read model/tokens/cost, retrieval query/docs/scores, tool args/result, reasoning, final response |
| P12 | All metrics visible at `/metrics`; Prometheus target UP; counters increase per request |
| P13 | Four dashboards auto-provisioned; each renders data after a demo run |
| P14 | ⭐ Each of the 5 failure tests produces its documented trace signature AND Grafana signal (slow tool → tool p95 ↑; failure → status=ERROR; bad retrieval → scores 0.2–0.3 visible; token-heavy → 80k+ input tokens & cost spike; timeout → LLM span ERROR + timeout rate ↑) |
| P15 | Response returns `x-request-id` + trace ID; same IDs appear in logs and Phoenix |
| P16 | The 10-point verification checklist passes in automated tests |
| P18 | README contains all 7 sections + screenshots; fresh-checkout runbook works |

## Environment & ports

`ANTHROPIC_API_KEY` (required) · `DATABASE_URL` (P3, default `postgres://postgres:postgres@localhost:5432/agent`) · `OTEL_EXPORTER_OTLP_ENDPOINT` (P6, default `http://localhost:6006/v1/traces`) · `PORT` (3000).
Ports: app **3000** · Phoenix **6006** · Postgres **5432** · Prometheus **9090** · Grafana **3001**.
