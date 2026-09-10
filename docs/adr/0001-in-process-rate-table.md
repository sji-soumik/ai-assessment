# In-process rate table for getMortgageRate

`getMortgageRate` (Phase 4) reads live rates from an in-process table rather than
a separate HTTP service or a database.

We considered three sources: a real HTTP mock (could genuinely refuse
connections for the Phase 14 failure demo), PostgreSQL alongside the pgvector
store, and a plain in-process table. We chose the in-process table because:

- **Isolation from retrieval.** Postgres is already the vector store. Putting
  live rates there would make the Phase 14 "connection refused" scenario a
  Postgres outage that *also* kills retrieval — two failures, not one clean tool
  failure.
- **Chaos is a function seam, not infrastructure.** Slow-tool (8s) and
  connection-refused faults are injected by wrapping one lookup function, with no
  extra container to run or fail.
- **No second service to operate** for what is otherwise a static lookup in this
  assessment.

Consequence: the rate table is not persistent or externally updatable. If a real
rate feed is needed later, replace the lookup function behind the same
`getMortgageRate` interface — callers and captured telemetry are unaffected.
