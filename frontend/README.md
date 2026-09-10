# Frontend

Next.js UI for the mortgage LangGraph agent. Proxies to the Bun backend via
`/api/chat` and `/api/health` (no CORS setup required).

## Prerequisites

- Backend running on port **3000** (`cd backend && bun run dev`)
- For RAG: Postgres + `bun run ingest` (see project README)
- `ANTHROPIC_API_KEY` set in `backend/.env` for live LLM answers

## Setup

```bash
cd frontend
npm install   # or: bun install
cp .env.example .env.local
npm run dev   # http://localhost:3001
```

## What you see

- **Chat** — send questions; starter prompts for base rate, FHA overlay, conventional rate
- **Agent pipeline** — animated LangGraph path (agent LLM → RAG → tool → reasoning → response)
- **Internal capture** — tabs for LLM tokens/latency, RAG chunks + similarity scores, tool args/results, raw JSON

Backend capture fields mirrored: `llmCalls`, `retrievals`, `toolCalls`, `durationMs`.
