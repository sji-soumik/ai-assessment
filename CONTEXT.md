# AI Observability Assessment

A mortgage-lending LangGraph agent. Per request it can call an LLM, retrieve
policy documents, and look up live rates via a tool. This glossary fixes the
language so the three components never overlap.

## Language

**Base rate**:
The lender's live reference rate, used to price products. It is a live number
owned by **getMortgageRate**, never stored in the knowledge base.
_Avoid_: prime rate, benchmark (when you mean the lender's reference rate).

**Mortgage rate**:
A live product quote for a given **product** and **term** (e.g. conventional
30-year). Also owned by **getMortgageRate**.
_Avoid_: interest rate, APR (APR is a different, fee-inclusive figure).

**getMortgageRate**:
The only live tool. Answers "what is the number right now" for the base rate
and product rates. Backed by an in-process rate table, not the knowledge base.

**Retrieve**:
The knowledge-base tool. Returns policy and product rules only — how the base
rate is used, eligibility overlays, underwriting notes. Never returns a live
number.
_Avoid_: search, lookup (reserve "lookup" for the rate tool).

**Document**:
One source markdown file we ingest into the knowledge base
(e.g. `product-overlays.md`).
_Avoid_: file, page.

**Chunk**:
One embedded slice of a **Document**. Similarity search returns **Chunks**, not
whole Documents. Each Chunk carries its own id and points back to its source
Document id.
_Avoid_: passage, segment, fragment.

**Top-K**:
The number of highest-scoring **Chunks** returned by a retrieval (default 4).

## Observability language

**Trace**:
One end-to-end record of a single user request through the agent — from the
incoming question to the final answer. Identified by a **trace id**.
_Avoid_: session, log (a Trace is the distributed-tracing unit, not a log line).

**Span**:
One timed operation inside a **Trace** — e.g. an LLM call, a retrieval, a tool
lookup, or the root agent span that wraps the whole request.
_Avoid_: step, event (Spans nest; they are not flat log events).

## Flagged ambiguities

**"base rate" vs the knowledge base**: A question about the *number* ("what is
the current base rate?") is a **getMortgageRate** call. A question about *how
the base rate is applied* ("how does the base rate affect FHA pricing?") is a
**Retrieve** call. The knowledge base explains the base rate; it never quotes it.

## Example dialogue

- Dev: "A user asks 'what is the current base rate?' — does that hit retrieval?"
- Expert: "No. That's a live number, so it's a **getMortgageRate** call with the
  default **product** (`base`) and **term** (30 years)."
- Dev: "And 'what's our FHA credit overlay?'"
- Expert: "That's policy — a **Retrieve** call. Top-K **Chunks** come back from
  the FHA overlays **Document**, and the LLM answers from them."
- Dev: "What if they ask both in one message?"
- Expert: "The agent can call both tools: **Retrieve** for the overlay rules,
  **getMortgageRate** for the FHA number. They stay separate sources of truth."
