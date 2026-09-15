# ai-assessment (backend)

TypeScript LangGraph mortgage agent. Setup, API, and current status live in the [project README](../README.md).

```bash
bun install
cp .env.example .env   # set OPENAI_API_KEY
bun run dev            # http://localhost:3000
curl -s http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"What is the current base rate?"}'
bun test
```

Phase plan: [SPEC.md](SPEC.md). Conventions: [AGENT.md](AGENT.md).
