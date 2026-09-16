import { type Span, SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "./otel";
import { currentRequestId } from "./requestContext";

/**
 * Explicit span wrapper (AGENT.md: no auto-instrumentation callbacks).
 * Nests under the active context, records exceptions, rethrows on error.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    const requestId = currentRequestId();
    if (requestId) span.setAttribute("request.id", requestId);
    try {
      const result = await fn(span);
      // Recoverable tool/retrieval failures set ERROR inside the callback and
      // do not rethrow — don't overwrite that with OK.
      const recorded = (span as { status?: { code: number } }).status?.code;
      if (recorded !== SpanStatusCode.ERROR) {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof Error) span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      throw err;
    } finally {
      span.end();
    }
  });
}
