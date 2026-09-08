import { HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "./agent/graph";
import { summarizeFlow } from "./agent/flow";
import { initTelemetry } from "./obs/otel";
import { SpanName } from "./obs/names";
import { withSpan } from "./obs/spans";

initTelemetry();

// Lazy so the server boots (and /health works) even before ANTHROPIC_API_KEY is
// configured; the first /chat surfaces a clear error instead of a boot crash.
let graph: ReturnType<typeof buildGraph> | undefined;
const getGraph = () => (graph ??= buildGraph());

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  routes: {
    "/health": () => Response.json({ ok: true }),
    "/chat": {
      POST: async (req) => {
        const started = performance.now();
        let body: { message?: string };
        try {
          body = (await req.json()) as { message?: string };
        } catch {
          return Response.json({ error: "invalid JSON body" }, { status: 400 });
        }
        if (!body.message) {
          return Response.json({ error: "missing 'message' field" }, { status: 400 });
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
          return Response.json(responseBody);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});

console.log(`ai-agent listening on http://localhost:${port}`);
