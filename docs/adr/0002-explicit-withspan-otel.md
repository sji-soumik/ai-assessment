# Explicit withSpan wrappers for OpenTelemetry

Every agent operation is instrumented with hand-written `withSpan()` calls at
known seams (server `/chat`, LLM node, retrieval node, tool node, respond node).

We considered LangChain/LangGraph auto-instrumentation callbacks and manual
wrappers. We chose explicit wrappers because:

- **Deterministic span tree.** The assessment requires a fixed hierarchy
  (`agent` → `llm.call` / `retrieval` / `tool.call` / `llm.reasoning` /
  `final.response`). Auto-instrumentation produces framework-internal spans that
  do not match the spec.
- **Capture-before-telemetry.** Phases 2–5 already record model, tokens, query,
  tool args, etc. into graph state. Span attribute setters read from those same
  records — one source of truth.
- **Recoverable errors stay in-trace.** Retrieval and tool failures set span
  status ERROR but do not fail the request; explicit wrappers make that boundary
  obvious.

Consequence: adding a new graph node requires a matching `withSpan` at that node.
OTel auto-instrumentation must stay disabled.
