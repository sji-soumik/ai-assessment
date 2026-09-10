import express, { type NextFunction, type Request, type Response } from "express";
import { HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "./agent/graph";
import { summarizeFlow } from "./agent/flow";
import { initTelemetry, shutdownTelemetry } from "./obs/otel";
import { SpanName } from "./obs/names";
import { withSpan } from "./obs/spans";

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

app.post("/chat", async (req, res) => {
  const started = performance.now();
  const body = req.body as { message?: string } | undefined;

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "invalid JSON body" });
    return;
  }
  if (!body.message) {
    res.status(400).json({ error: "missing 'message' field" });
    return;
  }

  try {
    let traceId: string | undefined;
    const responseBody = await withSpan(SpanName.agent, async (span) => {
      span.setAttribute("user.message.length", body.message!.length);
      traceId = span.spanContext().traceId;
      const result = await getGraph().invoke({
        messages: [new HumanMessage(body.message!)],
      });
      const flow = summarizeFlow(result);
      span.setAttribute("flow.complete", flow.isCompleteFlow);
      span.setAttribute("flow.steps", flow.steps.join(" → "));

      return {
        reply: result.finalAnswer,
        flow: flow.steps,
        traceId,
        llmCalls: result.llmCalls,
        retrievals: result.retrievals,
        toolCalls: result.toolCalls,
        durationMs: Math.round(performance.now() - started),
      };
    });
    res.json(responseBody);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
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
