# Local run

## Prerequisites

- Bun v1.3+
- Node.js (frontend)
- Docker
- OpenAI API key

## Ports

| Port | Service | Started by |
|------|---------|------------|
| 3000 | Agent API | `bun run dev` (host) |
| 3001 | Frontend | `npm run dev` (host) |
| 3002 | Grafana | Docker Compose |
| 5432 | PostgreSQL + pgvector | Docker Compose |
| 6006 | Arize Phoenix | Docker Compose |
| 9090 | Prometheus | Docker Compose |

| URL | Login |
|-----|--------|
| http://localhost:3001 | Chat UI |
| http://localhost:3000/health | — |
| http://localhost:3000/metrics | — |
| http://localhost:6006 | Phoenix |
| http://localhost:9090 | Prometheus |
| http://localhost:3002 | Grafana (`admin` / `admin`) |

Postgres: `postgres` / `postgres`, database `agent`.

## Run

**1. Infra** (`backend/`)

```bash
docker compose -f ops/docker-compose.yml up -d
```

**2. Backend** (`backend/`)

```bash
bun install
cp .env.example .env   # set OPENAI_API_KEY
bun run ingest
bun run dev            # :3000
```

Required `.env`:

```
OPENAI_API_KEY=
DATABASE_URL=postgres://postgres:postgres@localhost:5432/agent
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:6006/v1/traces
```

**3. Frontend** (`frontend/`)

```bash
npm install
cp .env.example .env.local
npm run dev            # :3001
```

`.env.local`:

```
BACKEND_URL=http://localhost:3000
```

Keep `bun run dev` running so Prometheus can scrape `/metrics`.
