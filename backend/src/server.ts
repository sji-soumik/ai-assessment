import express, { type NextFunction, type Request, type Response } from "express";
import { AgentInvokeError, invokeAgent } from "./agent/invoke";
import { buildGraph } from "./agent/graph";
import { parseScenario } from "./chaos";
import { initTelemetry, shutdownTelemetry } from "./obs/otel";
import { register } from "./obs/metrics";
import { resolveRequestId } from "./obs/requestContext";

initTelemetry();

// Lazy so the server boots (and /health works) even before ANTHROPIC_API_KEY is
// configured; the first /chat surfaces a clear error instead of a boot crash.
let graph: ReturnType<typeof buildGraph> | undefined;
const getGraph = () => (graph ??= buildGraph());

const port = Number(process.env.PORT ?? 3000);
const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

function setCorrelationHeaders(res: Response, requestId: string, traceId?: string): void {
  res.setHeader("x-request-id", requestId);
  if (traceId) res.setHeader("x-trace-id", traceId);
}

app.post("/chat", async (req, res) => {
  const body = req.body as
    | { message?: string; userId?: string; scenario?: string; requestId?: string }
    | undefined;

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "invalid JSON body" });
    return;
  }
  if (!body.message) {
    res.status(400).json({ error: "missing 'message' field" });
    return;
  }

  let scenario;
  try {
    scenario = parseScenario(body.scenario);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const requestId = resolveRequestId(req.header("x-request-id") ?? body.requestId);

  try {
    // llm_timeout needs a short-timeout model; do not reuse the singleton graph.
    const { result, flow, traceId, durationMs } = await invokeAgent(body.message, {
      userId: body.userId,
      requestId,
      scenario,
      graph: scenario === "llm_timeout" ? undefined : getGraph(),
    });

    setCorrelationHeaders(res, requestId, traceId);
    res.json({
      reply: result.finalAnswer,
      flow: flow.steps,
      requestId,
      traceId,
      llmCalls: result.llmCalls,
      retrievals: result.retrievals,
      toolCalls: result.toolCalls,
      durationMs,
    });
  } catch (err) {
    const request = err instanceof AgentInvokeError ? err.requestId : requestId;
    const traceId = err instanceof AgentInvokeError ? err.traceId : undefined;
    setCorrelationHeaders(res, request, traceId);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
      requestId: request,
      traceId,
    });
  }
});

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: "invalid JSON body" });
    return;
  }
  next(err);
});

const server = app.listen(port, () => {
  console.log(`ai-agent listening on http://localhost:${port}`);
});

let shuttingDown = false;
const onSignal = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`received ${signal}, flushing telemetry`);
  void shutdownTelemetry()
    .catch((err) => {
      console.error("telemetry shutdown failed:", err);
    })
    .finally(() => {
      server.close(() => process.exit(0));
    });
};

process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));
